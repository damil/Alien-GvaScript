//-----------------------------------------------------
// Some extensions to the prototype javascript framework
//-----------------------------------------------------
if (!window.Prototype)
  throw  new Error("Prototype library is not loaded");

// adds the method flash to SPAN, DIV, INPUT, BUTTON elements
// flashes an element by adding a classname for a brief moment of time
// options: {classname: // classname to add (default: flash)
//           duration:  // duration in ms to keep the classname (default: 100ms)}
Element.addMethods(['SPAN', 'DIV', 'INPUT', 'BUTTON', 'TEXTAREA', 'A'], {
    flash: function(element, options) {
        if (element._IS_FLASHING) return;
        element = $(element);

        options = options || {}; 
        var duration  = options.duration  || 100;
        var classname = options.classname || 'flash';

        element._IS_FLASHING = true;
        
        var endFlash  = function() {
            this.removeClassName(classname);
            this._IS_FLASHING = false;
        };

        element.addClassName(classname);
        setTimeout(endFlash.bind(element), duration);
    }
});

Object.extend(String.prototype, {
  chomp: function() {
    return this.replace(/(\n|\r)+$/, '');
  }
});

Object.extend(Element, {

  classRegExp : function(wanted_classes) {
    if (typeof wanted_classes != "string" &&
        wanted_classes instanceof Array)
       wanted_classes = wanted_classes.join("|");
    return new RegExp("\\b(" + wanted_classes + ")\\b");
  },

  hasAnyClass: function (elem, wanted_classes) {
    return Element.classRegExp(wanted_classes).test(elem.className);
  },

  getElementsByClassNames: function(parent, wanted_classes) {
    var regexp = Element.classRegExp(wanted_classes);
    var children = ($(parent) || document.body).getElementsByTagName('*');
    var result = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (regexp.test(child.className)) result.push(child);
    }
    return result;
  },

  // start at elem, walk nav_property until find any of wanted_classes
  navigateDom: function (elem, navigation_property, 
                         wanted_classes, stop_condition) {
    while (elem){
       if (stop_condition && stop_condition(elem)) break;
       if (elem.nodeType == 1 &&
           Element.hasAnyClass(elem, wanted_classes))
         return elem;
       // else walk to next element
       elem = elem[navigation_property];
     }
     return null;
  },


  autoScroll: function(elem, container, percentage) {
     percentage = percentage || 20; // default                  
     var parent = elem.offsetParent;
     var offset = elem.offsetTop;

     // offset calculations are buggy in Gecko, so we need a hack here
     if (/Gecko/.test(navigator.userAgent)) { 
       parent = elem.parentNode;
       while (parent) {
         var overflowY;
         try      {overflowY = Element.getStyle(parent, "overflowY")}
         catch(e) {overflowY = "visible";}
         if (overflowY != "visible") break; // found candidate for offsetParent
         parent = parent.parentNode;
       }
       parent  = parent || document.body;
       
       //offset -= parent.offsetTop
       // commented out Jean-Christophe 18.4.07 
       // solves a bug with autoCompleters, but new bug with choiceList ..
       // .. TODO: need to investigate further how firefox handles offsets.
     }

     container = container || parent;

     var min = offset - (container.clientHeight * (100-percentage)/100);
     var max = offset - (container.clientHeight * percentage/100);
     if      (container.scrollTop < min) container.scrollTop = min;
     else if (container.scrollTop > max) container.scrollTop = max;
  },

  outerHTML: function(elem) {
    var tag = elem.tagName;
    if (!tag)
      return elem;           // not an element node
    if (elem.outerHTML)
      return elem.outerHTML; // has builtin implementation 
    else {
      var attrs = elem.attributes;
      var str = "<" + tag;
      for (var i = 0; i < attrs.length; i++) {
        var val = attrs[i].value;
        var delim = val.indexOf('"') > -1 ? "'" : '"';
        str += " " + attrs[i].name + "=" + delim + val + delim;
      }
      return str + ">" + elem.innerHTML + "</" + tag + ">";
    }
  }

});

Class.checkOptions = function(defaultOptions, ctorOptions) {
  ctorOptions = ctorOptions || {}; // options passed to the class constructor
  for (var property in ctorOptions) {
    if (defaultOptions[property] === undefined)
      throw new Error("unexpected option: " + property);
  }
  return Object.extend(Object.clone(defaultOptions), ctorOptions);
};
  

Object.extend(Event, {

  detailedStop: function(event, toStop) {
    if (toStop.preventDefault) { 
      if (event.preventDefault) event.preventDefault(); 
      else                      event.returnValue = false;
    }
    if (toStop.stopPropagation) { 
      if (event.stopPropagation) event.stopPropagation(); 
      else                       event.cancelBubble = true;
    }
  },

  stopAll:  {stopPropagation: true, preventDefault: true},
  stopNone: {stopPropagation: false, preventDefault: false}

});

function ASSERT (cond, msg) {
  if (!cond) 
    throw new Error("Violated assertion: " + msg);
}

// detects if a global CSS_PREFIX has been set
// if yes, use it to prefix the css classes
// default to gva
function CSSPREFIX () {
    if(typeof CSS_PREFIX != 'undefined') {
        return (CSS_PREFIX)? CSS_PREFIX : 'gva';
    }
    return 'gva';
}

// escaping RegEx special characters .*+?|()[]{}\
RegExp.escape = function(str) {
    var specials = new RegExp("[.*+?|()\\[\\]{}\\\\]", "g");
    return str.replace(specials, "\\$&");
}; // do not remove ';'


/**
 * Event Delegation
 * Based on http://code.google.com/p/protolicious/source/browse/trunk/src/event.register.js
 * modified to support focus/blur event capturing
 * [http://www.quirksmode.org/blog/archives/2008/04/delegating_the.html]
 *
 * Prototype core is supposed to have this in v 1.7 !
 * Naming might differ, Event.register -> Event.delegate but at least
 * will have the same syntax
 */
// wrap in an anonymous function to avoid any variable conflict
(function() {
  var rules = { };
  var eventManager = function(o_id, event) {
    // IE sometimes fires some events
    // while reloading (after unregister)
    if(! rules[o_id]) return;

    var element = event.target;
    do {
      if (element.nodeType == 1) {
        element = Element.extend(element);
        for (var selector in rules[o_id][event.type]) {
          if (_match = matches(rules[o_id][event.type][selector]._selector, element)) {
            for (var i=0, handlers=rules[o_id][event.type][selector], l=handlers.length; i<l; ++i) {
              handlers[i].call(element, Object.extend(event, { _target: element, _match: _match.expression }));
            }
          }
        }
      }
    } while (element = element.parentNode)
  }
  var matches = function(selectors, element) {
    for (var i=0, l=selectors.length; i<l; ++i) {
      if (selectors[i].match(element)) return selectors[i];
    }
    return undefined;
  }

  Event.register = function(observer, selector, eventName, handler) {
    var use_capture = (eventName == 'focus' || eventName == 'blur');
    if(use_capture && Prototype.Browser.IE) {
        eventName = (eventName == 'focus')? 'focusin' : 'focusout';
    }
    var observer_id = observer.identify ? observer.identify() : 'document'; 

    // create entry in cache for rules per observer
    if(! rules[observer_id]) {
        rules[observer_id] = { };
    }

    // observe event only once on the same observer
    if(! rules[observer_id][eventName]) {
      rules[observer_id][eventName] = { };

      if(use_capture) {
        if(Prototype.Browser.IE)
        Event.observe(observer, eventName, eventManager.curry(observer_id));
        else
        observer.addEventListener(eventName, eventManager.curry(observer_id), true); 
      }
      else
      Event.observe(observer, eventName, eventManager.curry(observer_id));
    }    

    var _selector = [ ], expr = selector.strip();
    // instantiate Selector's
    Selector.split(selector).each(function(s) { _selector.push(new Selector(s)) })

    // store instantiated Selector for faster matching
    if (!rules[observer_id][eventName][expr]) {
      rules[observer_id][eventName][expr] = Object.extend([ ], { _selector: _selector });
    }

    // associate handler with expression
    rules[observer_id][eventName][expr].push(handler);
  }
    
  // unregistering an event on an elemment
  Event.unregister = function(elt, selector, eventName) {
    var _id = (typeof elt == 'string')? elt :
              (elt.identify)? elt.identify() : 'document'; 
    // unregister event identified by name and selector
    if (eventName) {
      rules[_id][eventName][selector] = null;
      delete rules[_id][eventName][selector];
    } 
    else {
      for (var eventName in rules[_id]) {
        // unregister all events identified by selector
        if(selector) {
          rules[_id][eventName][selector] = null;
          delete rules[_id][eventName][selector];
        }
        // unregister all events
        else {
          rules[_id][eventName] = null;
          delete rules[_id][eventName];
        }
      }
    }
  },

  // unregister *all* events registered using 
  // the Event.register method
  Event.unregisterAll = function() {
    for(var _id in rules) {
        Event.unregister(_id);
        delete rules[_id];
    }
  }

  Event.observe(window, 'unload', Event.unregisterAll);
  document.register = Event.register.curry(document);
  Element.addMethods({register: Event.register, unregister: Event.unregister});
})();

/**
 * Element storage API (extracted from prototype trunk)
 * will be a part in the future prototype release
 * v. 1.6.1
 */
Element.Storage = {
  UID: 1
};

Element.addMethods({
  getStorage: function(element) {
    if (!(element = $(element))) return;

    var uid;
    if (element === window) {
      uid = 0;
    } else {
      if (typeof element._prototypeUID === "undefined")
        element._prototypeUID = [Element.Storage.UID++];
      uid = element._prototypeUID[0];
    }

    if (!Element.Storage[uid])
      Element.Storage[uid] = $H();

    return Element.Storage[uid];
  },

  store: function(element, key, value) {
    if (!(element = $(element))) return;

    if (arguments.length === 2) {
      Element.getStorage(element).update(key);
    } else {
      Element.getStorage(element).set(key, value);
    }

    return element;
  },

  retrieve: function(element, key, defaultValue) {
    if (!(element = $(element))) return;
    var hash = Element.getStorage(element), value = hash.get(key);

    if (Object.isUndefined(value)) {
      hash.set(key, defaultValue);
      value = defaultValue;
    }

    return value;
  },

  clone: function(element, deep) {
    if (!(element = $(element))) return;
    var clone = element.cloneNode(deep);
    clone._prototypeUID = void 0;
    if (deep) {
      var descendants = Element.select(clone, '*'),
          i = descendants.length;
      while (i--) {
        descendants[i]._prototypeUID = void 0;
      }
    }
    return Element.extend(clone);
  }
});
