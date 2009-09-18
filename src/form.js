/* TODO

   - submit attrs on buttons
       - action / method / enctype / replace / target / novalidate
  - after_submit:
        - 204 NO CONTENT : leave doc, apply metadata
        - 205 RESET CONTENT : reset form
        - replace="document" (new page)
        - replace="values" (fill form with new tree)
        - relace element
        - others ?
        - "onreceive" event (response after submit)

  - check prototype.js serialize on multivalues
*/

GvaScript.Form = Class.create();

GvaScript.Form.Methods = {

  to_hash: function(form) {
    form = $(form);

    return form.serialize({hash:true});
  },

  to_tree: function(form) {
    form = $(form);
    
    // javascript version of Perl  CGI::Expand::expand_hash
    function expand_hash(flat_hash) {
        var tree = {};

        // iterate on keys in the flat hash
        for (var k in flat_hash) {
          var parts = k.split(/\./);
          var loop = {tree: tree, key: "root"};

          // iterate on path parts within the key
          for (var i = 0 ; i < parts.length; i++) {
            var part = parts[i];

            // if no subtree yet, build it (Array or Object)
            if (!loop.tree[loop.key])
            loop.tree[loop.key] = part.match(/^\d+$/) ? [] : {};

            // walk down to subtree
            loop = {tree: loop.tree[loop.key], key:part};
          }
          // store value in leaf
          loop.tree[loop.key] = flat_hash[k];
        }
        return tree.root;
      } 

      return expand_hash(GvaScript.Form.to_hash(form));
  },

  fill_from_tree : (function() {
  
    // IMPLEMENTATION NOTE : Form.Element.setValue() is quite similar,
    // but our treatment of arrays is different, so we have to reimplement
    var _fill_from_value = function(elem, val, is_init) {
      elem = $(elem);

      // force val into an array
      if (!(val instanceof Array)) val = [val]; 

      // get element type (might be a node list, which we call "collection")
      var elem_type = elem.type 
                  || (elem.length !== undefined ? "collection" : "unknown");
      var old_value = null; // needed for value:change custom event

      switch (elem_type) {
        case "collection":
          for (var i=0; i < elem.length; i++) {
            _fill_from_value(elem.item(i), val, is_init);
          }
        break;

        case "checkbox" :
        case "radio":
          old_value = elem.getValue();
          elem.checked = val.include(elem.value);
        break;

        case "text" :
        case "textarea" :
        case "hidden" :
          old_value = elem.getValue();
          elem.value = val.join(",");
        break;

        case "select-one" :
        case "select-multiple" :
          old_value = elem.getValue();
          $A(elem.options).each(function(opt){
            var opt_value = Form.Element.Serializers.optionValue(opt);
            opt.selected = val.include(opt_value);
          });
        break;

        default:
            throw new Error("unexpected elem type : " + elem.type);
        break;
      } // end switch

      if(elem.fire) // not to be called when elem_type is collection
      // called as a subsequence of GvaScript.Form.init method
      if(is_init) 
      elem.fire('value:init',   {newvalue: elem.getValue()});
      else                  
      elem.fire('value:change', {oldvalue: old_value, newvalue: elem.getValue()});
    }

    var _fill_from_array = function (form, field_prefix, array, is_init) {
      for (var i=0; i < array.length; i++) {
        var new_prefix = field_prefix + "." + i;

        // if form has a corresponding named element, fill it
        var elem = form[new_prefix];
        if (elem) {
          _fill_from_value(elem, array[i], is_init);
          continue;
        }

        // otherwise try to walk down to a repetition block

        // try to find an existing repetition block
        elem = form.down('#'+new_prefix); 

        // no repetition block found, try to instanciate one
        if (!elem) { 
          var placeholder = $(field_prefix + ".placeholder");
          if (placeholder && placeholder.repeat) {
            GvaScript.Repeat.add(placeholder, i + 1 - placeholder.repeat.count);
            elem = $(new_prefix);
          }
        }
        // recurse to the repetition block
        if (elem)
        GvaScript.Form.fill_from_tree(form, new_prefix, array[i], is_init);
      }           
    }
           
    function fill_from_tree(form, field_prefix, tree, is_init)  {
      form = $(form);
     
      for (var key in tree) {
        if (!tree.hasOwnProperty(key)) continue;

        var val = tree[key];
        var new_prefix = field_prefix ? field_prefix+'.'+key : key;

        switch (typeof(val)) {
          case "boolean" :
              val = val ? "true" : "";
              // NO break here

          case "number":
          case "string":
              var elem = form[new_prefix];
              if (elem) 
              _fill_from_value(elem, val, is_init); 
              break;

          case "object":
              if (val instanceof Array) 
              _fill_from_array(form, new_prefix, val, is_init);
              else 
              this.fill_from_tree(form, new_prefix, val, is_init);
              break;

          case "function":
          case "undefined":
              // do nothing
        }
      }
    }
    return fill_from_tree;
  })(),

  autofocus: function(container) {
    container = $(container);
    
    if(container) {
      var target = container.down('[autofocus]');
      // TODO : check if target is visible
      if (target) try {target.focus()} 
                      catch(e){}
    }
  },

  /**
    * wrapper around Element.register method.
    * method wrapped for special handling of form inputs 
    * 'change' and 'init' events
    *
    * all handlers will recieve 'event' object as a first arguement.
    * 'change' handler will also recieve input's oldvalue/newvalue as
    * second and third arguements respectively.
    * 'init' handler will also recieve input's newvalue as a 
    * second arguemen.
    *
    * @param {string} query : css selector to match elements
    *                         to watch
    * @param {string} eventname : standard event name that can be triggered
    *                             by form inputs + the custom 'init' event
    *                             that is triggerd on form initialization
    * @param {Function} handler : function to execute.
    *
    * @return undefined
    */
  register: function(form, query, eventname, handler) {
      form = $(form);

      switch(eventname) {
        // change event doesnot bubble in IE
        // rely on blur event to check for change
        // and fire value:change event
        case 'change':
          form.register(query, 'focus', function(event) {
              var elt = event._target;
              elt.store('value', elt.getValue());  
          });

          form.register(query, 'blur', function(event) {
              var elt      = event._target;
              var oldvalue = elt.retrieve('value');
              var newvalue = elt.getValue();

              if(oldvalue != newvalue) {
                  elt.fire('value:change', {
                      oldvalue : oldvalue, 
                      newvalue : newvalue,
                      handler  : handler
                  });
                  elt.store('value', newvalue);
              }
          });
        break;
        
        // value:init fired by GvaScript.Form.fill_from_tree method
        // used in formElt initialization
        case 'init':
          form.register(query, 'value:init', function(event) {
              handler(event, event.memo.newvalue);        
          });
        break;

        default:
          form.register(query, eventname, handler);
        break;
      }
  },

  /**
    * wrapper around Element.unregister method.
    * method wrapped for special handling of form inputs 
    * 'change' and 'init' events
    *
    * remove handler attached to eventname for inputs that match query
    *
    * @param {string} query : css selector to remove handlers from
    * @param {string} eventname : eventname to stop observing
    * @param {Funtion} handler : handler to stop firing oneventname
    *                            NOTE: should be identical to what was used in
    *                            register method.
    *                            {optional} : if not specified, will remove all 
    *                            handlers attached to eventname for indicated selector
    * @return undefined
    */
  unregister: function(form, query, eventname, handler) {
    form = $(form);

    switch(eventname) {
      case 'change' :
        form.unregister(query, 'focus', handler);
        form.unregister(query, 'blur',  handler);
      break;
      default :
        form.unregister(query, eventname, handler);
      break;
    }
  }
}
  
Object.extend(GvaScript.Form.prototype, function() {
    // private method to initialize and add actions
    // to form's actions bar
    function _addActionButtons(form) {
        var _actionsbar = $H(form.options.actionsbar);
        if(_actions_container = _actionsbar.get('container')) {
            _actions_container = $(_actions_container);
            _actions_list = _actionsbar.get('actions') || [];

            form.actionsbar = new GvaScript.CustomButtons.ActionsBar(_actions_container, {
                selectfirst: _actionsbar.get('selectfirst') ,
                actions: _actions_list
            });
        }
    }

    return { 
        formElt: null,
        actionsbar: null,
        initialize: function(formElt, options) {
            this.formElt = $(formElt);

            var defaults = {
                datatree: {},                               // data object to init form with
                dataprefix: '',                             // data prefix used on form elements


                actionsbar: {},                             // form actions
                registery: [],                              // list of [elements_selector, event_name, event_handler]
                
                onSubmit        : Prototype.emptyFunction,  // method to call on form.submit

                onInit          : Prototype.emptyFunction,  // called after form initialization
                onBeforeSubmit  : Prototype.emptyFunction,  // called right after form.submit
                onAfterSubmit   : Prototype.emptyFunction,  // submit method should notify this event when it succeeds
                onSubmitFailure : Prototype.emptyFunction,  // submit method should notify this event when it fails
                onDataValidationError : Prototype.emptyFunction  // form data validation failure
            }

            this.options = Object.extend(defaults, options || {});

            // attaching submitMethod to form.onsubmit event
            this.formElt.observe('submit', function() {
                // submit method only called if
                // onBeforeSubmit handler doesnot return false
                if(this.notify('onBeforeSubmit')) {
                  this.options.onSubmit(this);
                }
                return false;
            }.bind(this));

            // initializing watchers
            $A(this.options.registery).each(function(w) {
                this.register(w[0], w[1], w[2]);
            }, this);
            
            // workaround as change event doesnot bubble in IE
            this.formElt.observe('value:change', function(event) {
                if(event.memo.handler) {
                    event.memo.handler(event, 
                                       event.memo.newvalue,
                                       event.memo.oldvalue 
                    );
                }
                else {
                    if(Prototype.Browser.IE) {
                        var evt = document.createEventObject();
                        event.target.fireEvent('onblur', evt)
                    }
                    else {
                        var evt = document.createEvent("HTMLEvents");
                        evt.initEvent('blur', true, true); // event type,bubbling,cancelable
                        event.target.dispatchEvent(evt);
                    }
                }
            });

            // initializing form actions
            _addActionButtons(this);

            // initializing for with data
            GvaScript.Form.init(this.formElt,    
                                this.options.datatree, 
                                this.options.dataprefix);

            // declaring form as a widget
            this.formElt.store('widget', this);
            this.formElt.addClassName(CSSPREFIX()+'-widget');
            
            // register the instance
            GvaScript.Forms.register(this);

            // call onInit handler
            this.notify('onInit');
        },

        // returns id of the form
        getId: function() {
            return this.formElt.identify();
        },

        /**
         * notify the form instance with eventname
         * events supported are: onInit, onBeforeSubmit, onAfterSubmit, onSubmitFailure
         *
         * will first fire global handlers defined in GvaScript.Forms, if none returned false,
         * will continue to fire the handler defined on this Form instance.
         *
         * @param {string} eventName : eventName to fire
         * @param {object} arg : arguement to carry over to handler.
         *
         * @return boolean indicating whether all handlers have succeeded (if any)
         */
        notify: function(eventName, arg) {
            // first notify global observers
            if(GvaScript.Forms.notify(eventName, this, arg)) {
                // then fire instance handler
                if(this.options[eventName]) {
                    var handler_ok = this.options[eventName](this, arg);
                    return (handler_ok !== false);
                }
                return true;
            }
            // one of global observers fail
            else
            return false;
        },

        // instance destructor
        destroy: function() {
            GvaScript.Forms.unregister(this);

            if(this.actionsbar) this.actionsbar.destroy();

            this.formElt.stopObserving();
            this.formElt.unregister();
        }
    }
}());        

/**
 * GvaScript.Forms : 
 * - holds references to all GvaScript.Form instances indentified 
 *   by the instance.getId() method.
 *   handy to get GvaScript.Form instance based on the form id.
 *
 * - holds general observers to be executed on all GvaScript.Form 
 *   instances
 */ 
GvaScript.Forms = {
    observers: [],
    forms: $A(),
    
    register: function(form) {
      this.unregister(form);
      this.forms.push(form);
    },

    unregister: function(form) {
      // nothing to unregister
      if(!form) return;

      if(typeof form == 'string') form = this.get(form);
      
      // nothing to unregister
      if(!form) return false;

      // remove the reference from array
      this.forms = this.forms.reject(function(f) { return f.getId() == form.getId() });

      return true;
    },

    get: function(id) {
      return this.forms.find(function(f) {return f.getId() == id});
    }, 

    addObserver: function(observer) {
      this.removeObserver(observer);
      this.observers.push(observer);
    },
  
    removeObserver: function(observer) {  
      this.observers = this.observers.reject( function(o) { return o==observer });
    },
  
    notify: function(eventName, form, arg) {  
      var falsy_observer = this.observers.any(function(f) {
          if(f[eventName]) {
              return (f[eventName](form, arg) === false ? true : false); 
          }
      });

      return !falsy_observer;
    }
}

// GvaScript.Form helpers and methods
Object.extend(GvaScript.Form, GvaScript.Form.Methods);
Object.extend(GvaScript.Form, {
  init: function(form, tree, field_prefix) {
    form = $(form);

    GvaScript.Repeat.init(form);
    GvaScript.Form.fill_from_tree(form, 
                                  field_prefix || "", 
                                  tree || {},
                                  true);

    GvaScript.Form.autofocus(form);
  },

  add: function(repeat_name, count) {
    var n_blocks = GvaScript.Repeat.add(repeat_name, count);
    var last_block = repeat_name + "." + (n_blocks - 1);
    GvaScript.Form.autofocus(last_block);
  },

  remove: function(repetition_block) {
    // find element and repeat info
    var elem = $(repetition_block);
    elem.id.match(/(.*)\.(\d+)$/);
    var repeat_name = RegExp.$1;
    var remove_ix   = RegExp.$2;
    var form        = elem.up('form');

    // get form data corresponding to the repeated section (should be an array)
    var tree  = GvaScript.Form.to_tree(form);
    var parts = repeat_name.split(/\./);
    for (var i = 0 ; i < parts.length; i++) {
        if (!tree) break;
        tree = tree[parts[i]];
    }
    
    // remove rows below, and shift rows above
    if (tree && tree instanceof Array) {
        tree.splice(remove_ix, 1);
        for (var i = 0 ; i < remove_ix; i++) {
            delete tree[i];
        }
    }

    // call Repeat.remove() to remove from DOM
    GvaScript.Repeat.remove(repetition_block);

    // re-populate blocks above
    GvaScript.Form.fill_from_tree(form, repeat_name, tree);
  }
});

// copy GvaScript.Form methods into GvaScript.Form.prototype
// set the first arguement of methods to this.formElt
(function() {
  var update = function (array, args) {
    var arrayLength = array.length, length = args.length;
    while (length--) array[arrayLength + length] = args[length];
    return array;
  }

  for(var m_name in GvaScript.Form.Methods) {
    var method = GvaScript.Form.Methods[m_name];
    if (Object.isFunction(method)) {
      GvaScript.Form.prototype[m_name] = (function() {
        var __method = method;
        return function() {
          var a = update([this.formElt], arguments);
          return __method.apply(null, a);
        }
      })();
    }
  }
})();
