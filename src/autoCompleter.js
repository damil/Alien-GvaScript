/** 

CHECK: 
  - additionalParams (cf. DMWeb 

TODO: 
  - if ignorePrefix, should highlight current value (not the 1st one)
      a) change in _updateChoicesFunction (because there might be an
         initial value in the form)
      b) what happens if value set programmatically ?
      c) in _checkNewValue : do not destroy the choiceList; just update
         the element


  - messages : choose language
  - 'actions' are not documented because the design needs rethinking

  - dicoserver: encoding problem 

  - multivalue :
     - inconsistent variable names
     - missing doc
     - join char should be in the options

  - rajouter option "hierarchicalValues : true/false" (si true, pas besoin de
    refaire un appel serveur quand l'utilisateur rajoute des lettres).

 - typeAhead only works when autoSuggest is true !

  - ATTENTION : autoSuggestDelay also controls the timeout for validating input
     should have another timeout for calling the updateChoices()

  - sometimes arrowDown should force Ajax call even if < minChars

  - do a demo with 
     http://suggestqueries.google.com/complete/search?q=**&output=firefox  - 

  - unclear code status :
      - action items
      - choiceElementHTML

  -blankOK : clarify behaviour if empty string belongs to choiceList
 
  - cache choices. Modes are NOCACHE / CACHE_ON_BIND / CACHE_ON_SETUP

  - dependentFields should also work with non-strict autocompleters

**/

//----------------------------------------------------------------------
// CONSTRUCTOR
//----------------------------------------------------------------------

GvaScript.AutoCompleter = function(datasource, options) {

  var defaultOptions = {
    minimumChars     : 1,
    labelField       : "label",
    valueField       : "value",
    autoSuggest      : true,      // will dropDown automatically on keypress
    autoSuggestDelay : 200,       // milliseconds
    typeAhead        : true,      // will fill the inputElement on highlight
    classes          : {},        // see below for default classes
    maxHeight        : 200,       // pixels
    minWidth         : 200,       // pixels
    offsetX          : 0,         // pixels
    strict           : false,     // will not force to take value from choices
    completeOnTab    : true,      // will not force to take value from choices
    blankOK          : true,
    colorIllegal     : "red",
    scrollCount      : 5,
    actionItems      : null,       // choice items to invoke javascript method
    multivalued      : false,
    multivalue_separator :  /[;,\s]\s*/,
    choiceItemTagName: "div",
    htmlWrapper      : function(html) {return html;},
    observed_scroll  : null,      // observe the scroll of a given element and move the dropdown accordingly (useful in case of scrolling windows)
    additional_params: null,        //additional parameters with optional default values (only in the case where the datasource is a URL)
    http_method      : 'get', // when additional_params is set, we might to just pass them in the body of the request
    dependentFields  : {}
  };

  // more options for array datasources
  if (typeof datasource == "object" && datasource instanceof Array) { 
    defaultOptions.ignorePrefix  = false;  // will always display the full list
    defaultOptions.caseSensitive = true;
  }

  this.options = Class.checkOptions(defaultOptions, options);

  // temporary : checkNewValDelay is same as autoSuggestDelay. Later implementation
  // may treat them independently
  this.options.checkNewValDelay = this.options.autoSuggestDelay;

  var defaultClasses = {
    loading         : "AC_loading",
    dropdown        : "AC_dropdown",
    message         : "AC_message",
    action          : "AC_action"  // undocumented on purpose !
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);
  
  this.separator = new RegExp(this.options.multivalue_separator);
  this.default_separator_char = " "; //character used when the values are joined

  if (this.options.multivalued && this.options.strict) {
    throw new Error("not allowed to have a multivalued autocompleter in strict mode");
  }

  this.dropdownDiv = null;

  this.setdatasource(datasource);

  // prepare a keymap for all key presses; will be registered at first
  // focus() event; then a second set of keymap rules is pushed/popped
  // whenever the choice list is visible
  var basicHandler = this._keyPressHandler.bindAsEventListener(this);
  var detectedKeys = /^(BACKSPACE|DELETE|.)$/;
                   // catch any single char, plus some editing keys
  var basicMap     = { DOWN: this._ArrowDownHandler.bindAsEventListener(this),
                       REGEX: [[null, detectedKeys, basicHandler]] };
  this.keymap = new GvaScript.KeyMap(basicMap);

  // prepare some stuff to be reused when binding to inputElements
  this.reuse = {
    onblur  : this._blurHandler.bindAsEventListener(this),
    onclick : this._clickHandler.bindAsEventListener(this)
  };
}


GvaScript.AutoCompleter.prototype = {

//----------------------------------------------------------------------
// PUBLIC METHODS
//----------------------------------------------------------------------

  // autocomplete : called when the input element gets focus; binds 
  // the autocompleter to the input element 
  autocomplete: function(elem) { 
    elem = $(elem);// in case we got an id instead of an element

    if (!elem) throw new Error("attempt to autocomplete a null element");

    // if already bound, no more work to do
    if (elem === this.inputElement) return;

    // bind to the element; if first time, also register the event handlers
    this.inputElement = elem;
    if (!elem._autocompleter) { 
      elem._autocompleter = this;
      this.keymap.observe("keydown", elem, Event.stopNone);
      Element.observe(elem, "blur", this.reuse.onblur);
      Element.observe(elem, "click", this.reuse.onclick);

      // prevent browser builtin autocomplete behaviour
      elem.setAttribute("autocomplete", "off");
    }

    // initialize time stamps
    this._timeLastCheck = this._timeLastKeyPress = 0;

    // more initialization, but only if we did not just come back from a 
    // click on the dropdownDiv
    if (!this.dropdownDiv) {
      this.lastValue      = null;
      this.fireEvent("Bind", elem);
    }

    this._checkNewValue();
  },

  detach: function(elem) {
    elem._autocompleter = null;
    Element.stopObserving(elem, "blur", this.reuse.onblur);
    Element.stopObserving(elem, "keydown", elem.onkeydown);
  },

  displayMessage : function(message) {
    this._removeDropdownDiv();
    var div = this._mkDropdownDiv();
    div.innerHTML = message;
    Element.addClassName(div, this.classes.message);
  },

  // set additional params for autocompleters that have more than 1 param;
  // second param is the HTTP method (post or get)
  // DALNOTE 10.01.09 : pas de raison de faire le choix de la  méthode HTTP
  // dans  setAdditionalParams()! TOFIX. Apparemment, utilisé une seule fois dans 
  // DMWeb (root\src\tab_composition\form.tt2:43)
  setAdditionalParams : function(params, method) {
    this.additional_params = params;           
    this.options.http_method = method;
  },

  addAdditionalParam : function(param, value) {
    this.additional_params[param] = value;
  },

  setdatasource : function(datasource) {

    // remember datasource in private property
    this._datasource = datasource;

    // register proper "updateChoices" function according to type of datasource
    var ds_type = typeof datasource;
    this.updateChoices 
      = (ds_type == "string")   ? this._updateChoicesFromAjax
      : (ds_type == "function") ? this._updateChoicesFromCallback
      : (ds_type == "object" && datasource instanceof Array) 
                                ? this._updateChoicesFromArray 
      : undefined;
     if (!this.updateChoices)
      throw new Error("unexpected datasource type");
  },

  // 'fireEvent' function is copied from GvaScript.fireEvent, so that "this" 
  // in that code gets properly bound to the current object
  fireEvent: GvaScript.fireEvent, 

  // Set the element for the AC to look at to adapt its position. If elem is
  // null, stop observing the scroll.
  // DALNOTE 10.01.09 : pas certain de l'utilité de "set_observed_scroll"; si 
  // l'élément est positionné correctement dans le DOM par rapport à son parent,
  // il devrait suivre le scroll automatiquement. N'est utilisé dans DMWeb que
  // par "avocat.js".
  set_observed_scroll : function(elem) {
    if (!elem) {
        Event.stopObserving(this.observed_scroll, 'scroll', correct_dropdown_position);
        return;
    }

    this.observed_scroll = elem;
    this.currentScrollTop = elem.scrollTop;
    this.currentScrollLeft = elem.scrollLeft;
    var correct_dropdown_position = function() {
      if (this.dropdownDiv) {
        var dim = Element.getDimensions(this.inputElement);
        var pos = this.dropdownDiv.positionedOffset();
        pos.top  -= this.observed_scroll.scrollTop - this.currentScrollTop;
        pos.left -= this.observed_scroll.scrollLeft;
        this.dropdownDiv.style.top  = pos.top   + "px";
        this.dropdownDiv.style.left = pos.left  + "px"; 
      }
      this.currentScrollTop = this.observed_scroll.scrollTop;
      this.currentScrollLeft = this.observed_scroll.scrollLeft;
    }

    Event.observe(elem, 'scroll', correct_dropdown_position.bindAsEventListener(this));
  },


//----------------------------------------------------------------------
// PRIVATE METHODS
//----------------------------------------------------------------------

  _updateChoicesFromAjax: function (continuation) {

    // copies into local variables, needed for closures below (can't rely on 
    // 'this' because 'this' may have changed when the ajax call comes back)
    var autocompleter = this; 
    var inputElement  = this.inputElement;

    inputElement.style.backgroundColor = ""; // remove colorIllegal
    if (this._runningAjax)
      this._runningAjax.transport.abort();
    Element.addClassName(inputElement, this.classes.loading);
    var toCompleteVal = this._getValueToComplete();
    
    var complete_url = this._datasource + toCompleteVal;
    this._runningAjax = new Ajax.Request(
      complete_url,
      {asynchronous: true,
       method: this.options.http_method,
       parameters: this.additional_params, // for example {C_ETAT_AVOC : 'AC'}

          // DALNOTE 10.01.09: forcer du JSON dans le body du POST est spécifique DMWeb;
          // pour le cas général il faut pouvoir envoyer du x-www-form-urlencoded ordinaire
       postBody: this.options.http_method == 'post' ? Object.toJSON(additional_params) : null,

       contentType: "text/javascript",
       evalJSON: 'force', // will evaluate even if header != 'application/json'
       onSuccess: function(xhr) {
          // aborted by the onblur handler
          if(xhr.transport.status == 0) return;
          
          autocompleter._runningAjax = null;
          if (xhr.responseJSON)
              continuation(xhr.responseJSON);
       },
       onFailure: function(xhr) {
          autocompleter._runningAjax = null;
          autocompleter.displayMessage("pas de réponse du serveur");
       },
       onComplete: function(xhr) {
          Element.removeClassName(inputElement, 
                                  autocompleter.classes.loading);
       }
      });
    return true; // asynchronous
  },

  _updateChoicesFromCallback : function(continuation) {
    continuation(this._datasource(this._getValueToComplete()));
  },


  _updateChoicesFromArray : function(continuation) {
    if (this.options.ignorePrefix)
        continuation(this._datasource);
    else {
      var toCompleteVal = this._getValueToComplete();
      var regex = new RegExp("^" + toCompleteVal,
                             this.options.caseSensitive ? "" : "i");
      var matchPrefix = function(choice) {
        var value;
        switch(typeof choice) {
          case "object" : value = choice[this.options.valueField]; break;
          case "number" : value = choice.toString(10); break;
          case "string" : value = choice; break;
          default: throw new Error("unexpected type of value");
        }
        return value.search(regex) > -1;
      };
      continuation(this._datasource.select(matchPrefix.bind(this)));
    }
  },


  _blurHandler: function(event) { // does the reverse of "autocomplete()"


    
    // check if this is a "real" blur, or just a clik on dropdownDiv
    if (this.dropdownDiv) {
      var targ;
      var e = event;
      if (e.target) targ = e.target;
      else if (e.srcElement) targ = e.srcElement;
      if (targ.nodeType && targ.nodeType == 3) // defeat Safari bug
          targ = targ.parentNode;
      var x = Event.pointerX(e) || Position.cumulativeOffset(targ)[0];
      var y = Event.pointerY(e) || Position.cumulativeOffset(targ)[1];
      if (Position.within(this.dropdownDiv, x, y)) {
        // not a "real" blur ==> bring focus back to the input element
        this.inputElement.focus(); // will trigger again this.autocomplete()
        return;
      }
      else {
        this._removeDropdownDiv();
      }
    }
    
    // abort any pending ajax call
    if (this._runningAjax) this._runningAjax.transport.abort();
    Element.removeClassName(this.inputElement, this.classes.loading);    

    // if strict mode, inform client about the final status
    if (this.options.strict) {
        var value = this._getValueToComplete();

        // if choices are known, just inspect status
        if (this.choices)            
            this.fireFinalStatus(this.inputElement, this.choices);

        // if blank and blankOK, this is a legal value
        else if (!value && this.options.blankOK) {
            this._updateDependentFields(this.inputElement, "");
            this.fireEvent({type: "LegalValue", value: value}, 
                           this.inputElement);
        }

        // if not enough chars to get valid choices, this is illegal
        else if (value.length < this.options.minimumChars) {    
            this.inputElement.style.backgroundColor = this.options.colorIllegal;
            this._updateDependentFields(this.inputElement, null);
            this.fireEvent({type: "IllegalValue", value: value}, 
                           this.inputElement);
        }

        // otherwise get choices and then inspect status (maybe asynchronous)
        else 
            this.updateChoices(this.fireFinalStatus.bind(this, this.inputElement));
    }

    this.fireEvent("Leave", this.inputElement);
    this.inputElement = null;
  },

  fireFinalStatus: function (inputElement, choices) {
  // NOTE: takes inputElement and choices as arguments, because it might be
  // called asynchronously, after "this" has been detached from the input
  // element and the choices array, so we cannot call the object properties.

    var input_val = inputElement.value;
    for (var i=0; i < choices.length; i++) {
        var choice = this.choices[i];
        var val = (typeof choice == "string") ? choice 
                                              : choice[this.options.valueField];
        if (val == input_val 
            || (!this.options.caseSensitive &&
                  val.toUpperCase() == input_val.toUpperCase())) {

            // for backwards compatibility, we generate a "Complete" event, but
            // with a fake controller (as the real controller might be in a 
            // diffent state).
            this.fireEvent({ type      : "Complete",
                             index     : i,
                             controller: {choices: choices} }, inputElement);

            // update dependent fields
            this._updateDependentFields(inputElement, choice);

            // for new code : generate a "LegalValue" event
            this.fireEvent({ type       : "LegalValue", 
                             value      : val, 
                             choice     : choice,
                             controller : null  }, inputElement);

            // matched a legal value, so abort the loop and return
            return; 
        }
    }

    // if we reach here, the value was illegal
    inputElement.style.backgroundColor = this.options.colorIllegal;
    this._updateDependentFields(inputElement, null);
    this.fireEvent({ type       : "IllegalValue", 
                     value      : val, 
                     controller : null  }, inputElement);
   },

  _updateDependentFields: function(inputElement, choice) {
        // "choice" might be 
        //   - an object or nonempty string ==> update dependent fields
        //   - an empty string              ==> clear dependent fields
        //   - null                         ==> put "ILLEGAL_***" 
        var attr       = inputElement.getAttribute('ac:dependentFields');
        var dep_fields = attr ? eval("("+attr+")") : this.options.dependentFields;
        if (!dep_fields) return;

        var form       = inputElement.form;
        var name_parts = inputElement.name.split(/\./);
        
        for (var k in dep_fields) {
            name_parts[name_parts.length - 1] = k;
            var related_name  = name_parts.join('.');
            var related_field = form[related_name];
            if (related_field) {
                related_field.value
                    = (choice === null)              ? "!!ILLEGAL_" + k + "!!"
                    : (typeof choice == "object")    ? choice[dep_fields[k]]
                    : (typeof choice == "string")    ? choice
                    : "!!UNEXPECTED SOURCE FOR RELATED FIELD!!";
            }
        }
    },



  // if clicking in the 20px right border of the input element, will display
  // or hide the drowpdown div (like pressing ARROWDOWN or ESC)
  _clickHandler: function(event) {
    var x = event.offsetX || event.layerX; // MSIE || FIREFOX
    if (x > Element.getDimensions(this.inputElement).width - 20) {
        if ( this.dropdownDiv ) {
            this._removeDropdownDiv();
            Event.stop(event);
        }
        else
            this._ArrowDownHandler(event);
    }
  },

  _ArrowDownHandler: function(event) { 
    var value = this._getValueToComplete(); 
    var valueLength = (value || "").length; 
    if (valueLength < this.options.minimumChars)
      this.displayMessage("liste de choix à partir de " 
                            + this.options.minimumChars + " caractères");
    else 
      this._displayChoices();
    Event.stop(event);
  },

  _keyPressHandler: function(event) { 

    // after a blur, we still get a keypress, so ignore it
    if (!this.inputElement) return; 
    
    // first give back control so that the inputElement updates itself,
    // then come back through a timeout to update the Autocompleter

    // cancel pending timeouts because we create a new one
    if (this._timeoutId) clearTimeout(this._timeoutId);

    this._timeLastKeyPress = (new Date()).getTime(); 
    this._timeoutId = setTimeout(this._checkNewValue.bind(this), 
                                 this.options.checkNewValDelay);
    // do NOT stop the event here .. inputElement needs to get the keypress
    // event to update the field value
  },


  _checkNewValue: function() { 

    // ignore this keypress if after a blur (no input element)
    if (!this.inputElement) return; 

    // several calls to this function may be queued by setTimeout,
    // so we perform some checks to avoid doing the work twice
    if (this._timeLastCheck > this._timeLastKeyPress)
      return; // the work was done already
    var now = (new Date()).getTime();
    var deltaTime = now - this._timeLastKeyPress;
    if (deltaTime <  this.options.checkNewValDelay)
      return; // too young, let olders do the work

    // OK, we really have to check the value now
    this._timeLastCheck = now;
    var value = this._getValueToComplete();
    if (value != this.lastValue) {
      this.lastValue    = value;

      // invalidate previous lists of choices because value has changed
      this.choices = null; 
      this.choiceList = null;

      if (value.length >= this.options.minimumChars) {
        // create a "continuation function"
        var continuation = function (choices) {
            this.inputElement.style.backgroundColor = ""; // remove colorIllegal
            this.choices = choices;
            if (this.options.autoSuggest)
                this._displayChoices();
        };
        // call updateChoices (which then will call the continuation)
        this.updateChoices(continuation.bind(this));
      }
      else {
        this._removeDropdownDiv();
      }
    }
  },

  // return the value to be completed; added for multivalued autocompleters                  
  _getValueToComplete : function() {
    var value = this.inputElement.value;
    if (this.options.multivalued) {
      var vals = value.split(this.separator);
      value    = vals[vals.length-1];
    }
    return value;
  },

  // set the value of the field; used to set the new value of the field once the user 
  // pings a choice item 
  _setValue : function(value) {              
    if (!this.options.multivalued) {
        this.inputElement.value = value;
    } else {
        var vals = (this.inputElement.value).split(this.separator);
        var result = (this.separator).exec(this.inputElement.value);
        if (result) {
            var user_sep = result[0];
        }
        vals[vals.length-1] = value;
        this.inputElement.value = (vals).join(user_sep); 
    }
  
  },

  _typeAhead : function () {
    var curLen     = this.lastValue.length;
    var index      = this.choiceList.currentHighlightedIndex; 
    var suggestion = this._valueFromChoice(index);
    var newLen     = suggestion.length;
    this.inputElement.value = suggestion;

    if (this.inputElement.createTextRange){ // MSIE
      var range = this.inputElement.createTextRange();
      range.moveStart("character", curLen); // no need to moveEnd
      range.select(); // will call focus();
    }
    else if (this.inputElement.setSelectionRange){ // Mozilla
      this.inputElement.setSelectionRange(curLen, newLen);
    }
  },



//----------------------------------------------------------------------
// methods for the dropdown list of choices
//----------------------------------------------------------------------

  _mkDropdownDiv : function() {
    this._removeDropdownDiv();

    // if observed element for scroll, reposition
    var movedUpBy = 0;
    var movedLeftBy = 0;
    if (this.observed_scroll) {
        movedUpBy = this.observed_scroll.scrollTop;
        movedLeftBy = this.observed_scroll.scrollLeft;
    }

    // create div
    var div    = document.createElement('div');
    div.className = this.classes.dropdown;

    // positioning
    var coords = Position.cumulativeOffset(this.inputElement);
    var dim    = Element.getDimensions(this.inputElement);
    div.style.left      = coords[0] + this.options.offsetX - movedLeftBy + "px";
    div.style.top       = coords[1] + dim.height -movedUpBy + "px";
    div.style.maxHeight = this.options.maxHeight + "px";
    div.style.minWidth  = this.options.minWidth + "px";
    div.style.zIndex    = 32767; //Seems to be the highest valid value

    // insert into DOM
    document.body.appendChild(div);

    // simulate maxHeight/minWidth on old MSIE (must be AFTER appendChild())
    if (navigator.userAgent.match(/\bMSIE [456]\b/)) {
      div.style.setExpression("height", 
        "this.scrollHeight>" + this.options.maxHeight + "?" 
                             + this.options.maxHeight + ":'auto'");
      div.style.setExpression("width", 
        "this.scrollWidth<" + this.options.minWidth + "?" 
                            + this.options.minWidth + ":'auto'");
    }

    return this.dropdownDiv = div;
  },



  _displayChoices: function() {

    // if no choices are ready, can't display anything
    if (!this.choices) return;

    var toCompleteVal = this._getValueToComplete();

// LEGACY CODE ... see if we want to keep this
//     if (this.options.actionItems) {
//       var action = this.options.actionItems;
//       for (var k=0; k < action.length; k++) {
//         var action_label = action[k][this.options.labelField];
//         action[k][this.options.labelField] = "<span class=" + this.classes.action + ">" 
//                                            +    action_label 
//                                            + "</span>";
//         this.choices[this.choices.length] = action[k];
//       }
//     }

    if (this.choices.length > 0) {
      var ac = this;
      var cl = this.choiceList = new GvaScript.ChoiceList(this.choices, {
        labelField        : this.options.labelField,
        scrollCount       : this.options.scrollCount,
        choiceItemTagName : this.options.choiceItemTagName,
        htmlWrapper       : this.options.htmlWrapper
      });


      // TODO: explain and publish method "choiceElementHTML", or redesign
      // and make it a private method
      if ( this.choiceElementHTML ) {
        cl.choiceElementHTML = this.choiceElementHTML;
      }

      cl.onHighlight = function(event) {
        if (ac.options.typeAhead) 
          ac._typeAhead();
        ac.fireEvent(event, ac.inputElement);
      };
      cl.onPing = function(event) {
        ac._completeFromChoiceElem(event.target);
      };
      cl.onCancel = function(event) {
        ac._removeDropdownDiv();
      };

      // fill container now so that the keymap gets initialized
      cl.fillContainer(this._mkDropdownDiv());

      // catch keypress on TAB while choiceList has focus
      var autocompleter = this;
      cl.keymap.rules[0].TAB = cl.keymap.rules[0].S_TAB = function(event) {
        if (!autocompleter.options.completeOnTab)
            return;
        var index = cl.currentHighlightedIndex;
        if (index != undefined) {

            // LEGACY CODE
//           // Only return and click events should launch action items
//           if (ac.choices[index]['action'])
//               return;

          var elem = cl._choiceElem(index);

          // generate a "Ping" on the choiceList, like if user had
          // pressed RETURN to select the current highlighted item
          cl.fireEvent({type : "Ping", 
                        index: index}, elem, cl.container);

          // NO Event.stop() here, because the navigator should
          // do the tabbing (pass focus to next/previous element)
        }
      };

      // more key handlers when the suggestion list is displayed
      this.keymap.rules.push(cl.keymap.rules[0]);

    }
    else 
      this.displayMessage("pas de suggestion");
  },


  _removeDropdownDiv: function() { 

    // remove the dropdownDiv that was added previously by _mkDropdownDiv();
    // that div contained either a menu of choices or a message to the user
    if (this.dropdownDiv) {
      Element.remove(this.dropdownDiv);
      this.dropdownDiv = null;
    }

    // if applicable, also remove rules previously pushed by _displayChoices
    if (this.keymap.rules.length > 1)
      this.keymap.rules.pop(); 
  },


  _valueFromChoice: function(index) {
    if (!this.choices || this.choices.length < 1) return null;
    var choice = this.choices[index];
    return (typeof choice == "string") ? choice 
                                       : choice[this.options.valueField];
  },


  //triggered by the onPing event on the choicelist, i.e. when the user selects
  //one of the choices in the list
  _completeFromChoiceElem: function(elem) {
    // identify the selected line and handle it
    var num = parseInt(elem.id.match(/\.(\d+)$/)[1], 10);
    var choice = this.choices[num];
    if (!choice && choice!="" && choice!=0) 
        throw new Error("choice number is out of range : " + num);

    // LEGACY CODE
//     var action = choice['action'];
//     if (action) {
//         this._removeDropdownDiv(); 
//         eval(action);
//         return;
//     }

    // add the value to the input element
    var value = this._valueFromChoice(num);
    if (value !== null) {
      this.lastValue    = value;
      this._setValue(value)
      this._removeDropdownDiv();
      if (!this.options.multivalued) {
        this.inputElement.select();
      } 
      this.fireEvent({type: "Complete", index: num}, elem, this.inputElement); 
    }
  }

}

