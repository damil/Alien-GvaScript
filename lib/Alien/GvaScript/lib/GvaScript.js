/*-------------------------------------------------------------------------*
 * GvaScript - Javascript framework born in Geneva.
 *
 *  Authors: Laurent Dami            <laurent.d...@etat.ge.ch>
 *           Jean-Christophe Durand  <jean-christophe.d.....@etat.ge.ch>
 *           S�bastien Cuendet       <sebastien.c.....@etat.ge.ch>
 *  LICENSE
 *  This library is free software, you can redistribute it and/or modify
 *  it under the same terms as Perl's artistic license.
 *
 *--------------------------------------------------------------------------*/

var GvaScript = {
  Version: '1.11'
}

//----------protoExtensions.js
//-----------------------------------------------------
// Some extensions to the prototype javascript framework
//-----------------------------------------------------
if (!window.Prototype)
  throw  new Error("Prototype library is not loaded");

// adds the method flash to SPAN, DIV, INPUT, BUTTON elements
// flashes an element by adding a classname for a brief moment of time
// options: {classname: // classname to add (default: flash)
//           duration:  // duration in ms to keep the classname (default: 100ms)}
Element.addMethods(['SPAN', 'DIV', 'INPUT', 'BUTTON'], {
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
function CSSPREFIX () {
    if(typeof CSS_PREFIX != 'undefine') {
        return (CSS_PREFIX)? CSS_PREFIX + '-' : '';
    }
    return '';
}

//----------event.js
// array holding fired events that are pending to be executed
// useful for avoiding accidental double firing of events
// events in queue are unique per eventType&eventTarget
GvaScript.eventsQueue = Class.create(); 
Object.extend(GvaScript.eventsQueue, {
    _queue: $A([]),
    hasEvent: function(target, name) {
        return (typeof this._queue.find(function(e) {
            return (e.target == target && e.name == name);
        }) == 'object');
    },
    pushEvent: function(target, name) {
        this._queue.push({target: target, name: name});
    },
    popEvent: function(target, name) {
        this._queue = this._queue.reject(function(e) {
            return (e.target == target && e.name == name);
        }); 
    }
});

// fireEvent : should be COPIED into controller objects, so that 
// 'this' is properly bound to the controller

GvaScript.fireEvent = function(/* type, elem1, elem2, ... */) {

  var event;

  switch (typeof arguments[0]) {
  case "string" : 
    event = {type: arguments[0]}; 
    break;
  case "object" :
    event = arguments[0];
    break;
  default:
    throw new Error("invalid first argument to fireEvent()");
  }
  
  var propName = "on" + event.type;
  var handler;
  var target   = arguments[1]; // first element where the event is triggered
  var currentTarget;           // where the handler is found

  // event already fired and executing
  if(GvaScript.eventsQueue.hasEvent(target, event.type)) return;

  // try to find the handler, first in the HTML elements, then in "this"
  for (var i = 1, len = arguments.length; i < len; i++) {
    var elem = arguments[i];
    if (handler = elem.getAttribute(propName)) {
      currentTarget = elem;
      break;
    }
  }
  if (currentTarget === undefined)
    if (handler = this[propName])
      currentTarget = this;

  if (handler) {
    // build context and copy into event structure
    var controller = this;
    if (!event.target)        event.target        = target;
    if (!event.srcElement)    event.srcElement    = target;
    if (!event.currentTarget) event.currentTarget = currentTarget;
    if (!event.controller)    event.controller    = controller;

    // add the event to the queue, it's about to be fired
    GvaScript.eventsQueue.pushEvent(target, event.type);
    
    var event_return = null; // return value of event execution
    if (typeof(handler) == "string") {
      // string will be eval-ed in a closure context where 'this', 'event',
      // 'target' and 'controller' are defined.
      var eval_handler = function(){return eval( handler ) };
      handler = eval_handler.call(currentTarget); // target bound to 'this'
    }

    if (handler instanceof Function) {
      // now call the eval-ed or pre-bound handler
      event_return = handler(event);
    }
    else {
      // whatever was returned by the string evaluation
      event_return = handler; 
    }

    // event executed, pop from the queue
    // keep a safety margin of 1sec before allowing 
    // the same event on the same element to be refired 
    // TODO: is 1sec reasonable
    window.setTimeout(function() {
        GvaScript.eventsQueue.popEvent(target, event.type)
    }, 1000);
    
    return event_return;
  }
  else
    return null; // no handler found
};


//----------keyMap.js

//constructor
GvaScript.KeyMap = function (rules) {
    if (!(rules instanceof Object)) throw "KeyMap: invalid argument";
    this.rules = [rules];
    return this;
};
  

GvaScript.KeyMap.prototype = {
    
  eventHandler: function (options) {

    var keymap = this;

    var defaultOptions = Event.stopAll;
    options = Class.checkOptions(defaultOptions, options || {});

    return function (event) {
      event = event || window.event;

      // translate key code into key name
      event.keyName = keymap._builtinName[event.keyCode] 
	           || String.fromCharCode(event.keyCode);

      // add Control|Shift|Alt modifiers
      event.keyModifiers = "";
      if (event.ctrlKey  && !options.ignoreCtrl)  event.keyModifiers += "C_";
      if (event.shiftKey && !options.ignoreShift) event.keyModifiers += "S_";
      if (event.altKey   && !options.ignoreAlt)   event.keyModifiers += "A_";

      // but cancel all modifiers if main key is Control|Shift|Alt
      if (event.keyName.search(/^(CTRL|SHIFT|ALT)$/) == 0) 
	event.keyModifiers = "";

      // try to get the corresponding handler, and call it if found
      var handler = keymap._findInStack(event, keymap.rules);
      if (handler) {
        var toStop = handler.call(keymap, event);
        Event.detailedStop(event, toStop || options);
      }
    };
  },

  observe: function(eventType, elem, options) {
    eventType = eventType || 'keydown';
    elem      = elem      || document;

    // "Shift" modifier usually does not make sense for keypress events
    if (eventType == 'keypress' && !options) 
      options = {ignoreShift: true};

    Event.observe(elem, eventType, this.eventHandler(options));
  },


  _findInStack: function(event, stack) {
    for (var i = stack.length - 1; i >= 0; i--) {
      var rules = stack[i];

      // trick to differentiate between C_9 (digit) and C_09 (TAB)
      var keyCode = event.keyCode>9 ? event.keyCode : ("0"+event.keyCode);

      var handler = rules[event.keyModifiers + event.keyName]
                 || rules[event.keyModifiers + keyCode]
                 || this._regex_handler(event, rules.REGEX, true)
                 || this._regex_handler(event, rules.ANTIREGEX, false);
      if (handler) 
        return handler;
    }
    return null;
  },

  _regex_handler: function(event, regex_rules, want_match) {
    if (!regex_rules) return null;
    for (var j = 0; j < regex_rules.length; j++) {
      var rule      = regex_rules[j];
      var modifiers = rule[0];
      var regex     = rule[1];
      var handler   = rule[2];

      var same_modifiers = modifiers == null 
                        || modifiers == event.keyModifiers;

      // build regex if it was passed as a string
      if (typeof(regex) == "string") 
        regex = new RegExp("^(" + regex + ")$");

      var match = same_modifiers && regex.test(event.keyName);
      if ((match && want_match) || (!match && !want_match)) 
        return handler;
    }
    return null;
  },

  _builtinName: {
      8: "BACKSPACE",
      9: "TAB",
     10: "LINEFEED",
     13: "RETURN",
     16: "SHIFT",
     17: "CTRL",
     18: "ALT",
     19: "PAUSE",
     20: "CAPS_LOCK",
     27: "ESCAPE",
     32: "SPACE",
     33: "PAGE_UP",
     34: "PAGE_DOWN",
     35: "END",
     36: "HOME",
     37: "LEFT",
     38: "UP",
     39: "RIGHT",
     40: "DOWN",
     44: "PRINT_SCREEN", // MSIE6.0: will only fire on keyup!
     45: "INSERT",
     46: "DELETE",
     91: "WINDOWS",
     96: "KP_0",
     97: "KP_1",
     98: "KP_2",
     99: "KP_3",
    100: "KP_4",
    101: "KP_5",
    102: "KP_6",
    103: "KP_7",
    104: "KP_8",
    105: "KP_9",
    106: "KP_STAR",
    107: "KP_PLUS",
    109: "KP_MINUS",
    110: "KP_DOT",
    111: "KP_SLASH",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NUM_LOCK",
    145: "SCROLL_LOCK"
  }
};

GvaScript.KeyMap.MapAllKeys = function(handler) {
    return {REGEX:[[null, /.*/, handler]]}
};


GvaScript.KeyMap.Prefix = function(rules) {

    // create a specific handler for the next character ...
    var one_time_handler = function (event) {
        this.rules.pop(); // cancel prefix
        var handler = this._findInStack(event, [rules]);
        if (handler) handler.call(this, event);
    }

    // ... and push that handler on top of the current rules
    return function(event) {
        this.rules.push(GvaScript.KeyMap.MapAllKeys(one_time_handler));
    }
};


//----------treeNavigator.js
//-----------------------------------------------------
// Constructor
//-----------------------------------------------------

GvaScript.TreeNavigator = function(elem, options) {

  // fix bug of background images on dynamic divs in MSIE 6.0, see URLs
  // http://www.bazon.net/mishoo/articles.epl?art_id=958
  // http://misterpixel.blogspot.com/2006/09/forensic-analysis-of-ie6.html
  try { document.execCommand("BackgroundImageCache",false,true); }
  catch(e) {}; 


  elem = $(elem); // in case we got an id instead of an element
  options = options || {};

  // default options
  var defaultOptions = {
    tabIndex            : -1,
    treeTabIndex        :  0,
    flashDuration       : 200,     // milliseconds
    flashColor          : "red",
    selectDelay         : 100,     // milliseconds
    selectOnButtonClick : false,
    noPingOnFirstClick  : false,
    selectFirstNode     : true,
    createButtons       : true,
    autoScrollPercentage: 20,
    classes             : {},
    keymap              : null
  };

  this.options = Class.checkOptions(defaultOptions, options);

  // values can be single class names or arrays of class names
  var defaultClasses = {
    node     : "TN_node",
    leaf     : "TN_leaf",
    label    : "TN_label",
    closed   : "TN_closed",
    content  : "TN_content",
    selected : "TN_selected",
    mouse    : "TN_mouse",
    button   : "TN_button",
    showall  : "TN_showall"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);
  this.classes.nodeOrLeaf = [this.classes.node, this.classes.leaf].flatten();

  // connect to the root element
  this.rootElement = elem;
  this.initSubTree(elem);

  // initializing the keymap
  var keyHandlers = {
    DOWN:       this._downHandler   .bindAsEventListener(this),
    UP:         this._upHandler     .bindAsEventListener(this),
    LEFT:       this._leftHandler   .bindAsEventListener(this),
    RIGHT:      this._rightHandler  .bindAsEventListener(this),
    KP_PLUS:    this._kpPlusHandler .bindAsEventListener(this),
    KP_MINUS:   this._kpMinusHandler.bindAsEventListener(this),
    KP_STAR:    this._kpStarHandler .bindAsEventListener(this),
    KP_SLASH:   this._kpSlashHandler.bindAsEventListener(this),
    C_R:        this._ctrl_R_handler.bindAsEventListener(this),
    RETURN:     this._ReturnHandler .bindAsEventListener(this),
    C_KP_STAR:  this._showAll       .bindAsEventListener(this, true),
    C_KP_SLASH: this._showAll       .bindAsEventListener(this, false),
    HOME:       this._homeHandler   .bindAsEventListener(this),
    END:        this._endHandler    .bindAsEventListener(this),

    C_PAGE_UP  : this._ctrlPgUpHandler  .bindAsEventListener(this),
    C_PAGE_DOWN: this._ctrlPgDownHandler.bindAsEventListener(this),


    // to think : do these handlers really belong to Tree.Navigator?
    PAGE_DOWN:function(event){window.scrollBy(0, document.body.clientHeight/2);
                              Event.stop(event)},
    PAGE_UP:  function(event){window.scrollBy(0, - document.body.clientHeight/2);
                              Event.stop(event)}
  };
  if (this.options.tabIndex >= 0)
    keyHandlers["TAB"] = this._tabHandler.bindAsEventListener(this);

  // handlers for ctrl_1, ctrl_2, etc. to open the tree at that level
  var numHandler = this._chooseLevel.bindAsEventListener(this);
  $R(1, 9).each(function(num){keyHandlers["C_" + num] = numHandler});

  // tabIndex for the tree element
  elem.tabIndex = elem.tabIndex || this.options.treeTabIndex;

  if (options.keymap) {
    this.keymap = options.keymap;
    this.keymap.rules.push(keyHandlers);
  }
  else {
    this.keymap = new GvaScript.KeyMap(keyHandlers);

    // observe keyboard events on tree (preferred) or on document
    var target = (elem.tabIndex  < 0) ? document : elem;
    this.keymap.observe("keydown", target, Event.stopNone);
  }

  // selecting the first node
  if (this.options.selectFirstNode) {
    this.select(this.firstSubNode());

    // if labels do not take focus but tree does, then set focus on the tree
    if (this.options.tabIndex < 0 && elem.tabIndex >= 0)
      elem.focus();
  }
}


GvaScript.TreeNavigator.prototype = {

//-----------------------------------------------------
// Public methods
//-----------------------------------------------------


  initSubTree: function (elem) {
    var labels = Element.getElementsByClassNames(elem, this.classes.label);
    this._addButtonsAndHandlers(labels); 
    this._addTabbingBehaviour(labels);
  },

  isClosed: function (node) {
    return Element.hasAnyClass(node, this.classes.closed); 
  },

  isVisible: function(elem) { // true if elem is not display:none
    return elem.offsetTop > -1;
  },

  isLeaf: function(node) {
    return Element.hasAnyClass(node, this.classes.leaf);
  },

  isRootElement: function(elem) {
    return (elem === this.rootElement);
  },


  close: function (node) {
    if (this.isLeaf(node))
      return;
    Element.addClassName(node, this.classes.closed);             
    this.fireEvent("Close", node, this.rootElement);

    // if "selectedNode" is no longer visible, select argument node as current
    var selectedNode = this.selectedNode;
    var walkNode = selectedNode;
    while (walkNode && walkNode !== node) {
      walkNode = this.parentNode(walkNode);
    }
    if (walkNode && selectedNode !== node) 
      this.select(node);
  },

  open: function (node) {
    if (this.isLeaf(node))
      return;

    Element.removeClassName(node, this.classes.closed);
    this.fireEvent("Open", node, this.rootElement);
    if (!this.content(node))
      this.loadContent(node);
  },

  toggle: function(node) {
    if (this.isClosed(node))
        this.open(node);
    else
        this.close(node);
  },

  openEnclosingNodes: function (elem) {
    var node = this.enclosingNode(elem);
    while (node) {
      if (this.isClosed(node))
        this.open(node);
      node = this.parentNode(node);
    }
  },

  openAtLevel: function(elem, level) {
    var method = this[(level > 1) ? "open" : "close"];
    var node = this.firstSubNode(elem);
    while (node) {
      method.call(this, node); // open or close
      this.openAtLevel(node, level-1);
      node = this.nextSibling(node);
    }
  },

  loadContent: function (node) {
    var url = node.getAttribute('tn:contenturl');
    // TODO : default URL generator at the tree level

    if (url) {
      var content = this.content(node);
      if (!content) {
        content = document.createElement('div');
        content.className = this.classes.content;
        var content_type = node.getAttribute('content_type');
        if (content_type) content.className += " " + content_type;
        content.innerHTML = "loading " + url;
        node.insertBefore(content, null); // null ==> insert at end of node
      }
      this.fireEvent("BeforeLoadContent", node, this.rootElement);

      var treeNavigator = this; // needed for closure below
      var callback = function() {
        treeNavigator.initSubTree(content);
        treeNavigator.fireEvent("AfterLoadContent", node, this.rootElement);
      };
      new Ajax.Updater(content, url, {onComplete: callback});
      return true;
    }
  },

  select: function (node) {
    var previousNode = this.selectedNode;

    // re-selecting the current node is a no-op
    if (node == previousNode) return;

    // deselect the previously selected node
    if (previousNode) {
        var label = this.label(previousNode);
        if (label) Element.removeClassName(label, this.classes.selected);
    }


    // select the new node
    var now = (new Date()).getTime(); 
    if (node)
        this._lastSelectTime = now;
    this.selectedNode = node;
    if (node) {
      this._assertNodeOrLeaf(node, 'select node');
      var label = this.label(node);
      if (!label) {
        throw new Error("selected node has no label");
      }
      else {
        Element.addClassName(label, this.classes.selected);

        if (this.isVisible(label)) {
          if (this.options.autoScrollPercentage !== null)
            Element.autoScroll(label, 
                               this.rootElement, 
                               this.options.autoScrollPercentage);
        }
      }
    }

    // register code to call the selection handlers after some delay
    if (! this._selectionTimeoutId) {
      var callback = this._selectionTimeoutHandler.bind(this, previousNode);
      this._selectionTimeoutId = 
        setTimeout(callback, this.options.selectDelay);
    }
  },


  label: function(node) {
    this._assertNodeOrLeaf(node, 'label: arg type');
    return Element.navigateDom(node.firstChild, 'nextSibling',
                               this.classes.label);
  },

  content: function(node) {
    if (this.isLeaf(node)) return null;
    this._assertNode(node, 'content: arg type');
    return Element.navigateDom(node.lastChild, 'previousSibling',
                               this.classes.content);
  },

  parentNode: function (node) {
    this._assertNodeOrLeaf(node, 'parentNode: arg type');
    return Element.navigateDom(
      node.parentNode, 'parentNode', this.classes.node, 
      this.isRootElement.bind(this));
  },

  nextSibling: function (node) {
    this._assertNodeOrLeaf(node, 'nextSibling: arg type');
    return Element.navigateDom(node.nextSibling, 'nextSibling',
                               this.classes.nodeOrLeaf);
                                 
  },

  previousSibling: function (node) {
    this._assertNodeOrLeaf(node, 'previousSibling: arg type');
    return Element.navigateDom(node.previousSibling, 'previousSibling',
                               this.classes.nodeOrLeaf);
                                 
  },

  firstSubNode: function (node) {
    node = node || this.rootElement;
    var parent = (node == this.rootElement) ? node 
               : this.isLeaf(node)          ? null
               :                              this.content(node);
    return parent ? Element.navigateDom(parent.firstChild, 'nextSibling',
                                        this.classes.nodeOrLeaf)
                  : null;
  },

  lastSubNode: function (node) {
    node = node || this.rootElement;
    var parent = (node == this.rootElement) ? node 
               : this.isLeaf(node)          ? null
               :                              this.content(node);
    return parent ? Element.navigateDom(parent.lastChild, 'previousSibling',
                                        this.classes.nodeOrLeaf)
                  : null;
  },

  lastVisibleSubnode: function(node) {
    node = node || this.rootElement;
    while(!this.isClosed(node)) {
      var lastSubNode = this.lastSubNode(node);
      if (!lastSubNode) break;
      node = lastSubNode;
    }
    return node;
  },

  // find next displayed node (i.e. skipping hidden nodes).
  nextDisplayedNode: function (node) {
    this._assertNodeOrLeaf(node, 'nextDisplayedNode: arg type');

    // case 1: node is opened and has a subtree : then return first subchild
    if (!this.isClosed(node)) {
      var firstSubNode = this.firstSubNode(node);
      if (firstSubNode) return firstSubNode;
    }
	
    // case 2: current node or one of its parents has a sibling 
    while (node) {
      var sibling = this.nextSibling(node);

      if (sibling) {
        if (this.isVisible(sibling)) 
          return sibling;
        else 
          node = sibling;
      }
      else
        node = this.parentNode(node);
    }

    // case 3: no next Node
    return null;
  },

  // find previous displayed node (i.e. skipping hidden nodes).
  previousDisplayedNode: function (node) {
    this._assertNodeOrLeaf(node, 'previousDisplayedNode: arg type');
    var node_init = node;

    while (node) {
      node = this.previousSibling(node);
      if (node && this.isVisible(node))
        return this.lastVisibleSubnode(node);
    }

    // if no previous sibling
    return this.parentNode(node_init);
  },

  enclosingNode:  function (elem) {
    return Element.navigateDom(
      $(elem), 'parentNode', this.classes.node, 
      this.isRootElement.bind(this));
  },


  // flash the node
  flash: function (node) {
    var label = this.label(node);

    ASSERT(label, "node has no label");

    label.flash({duration: 200});
  },

  fireEvent: function(eventName, elem) {
    var args = [eventName];
    while (elem) {
      args.push(elem);
      elem = this.parentNode(elem);
    }
    args.push(this.rootElement);
    return GvaScript.fireEvent.apply(this, args);
  },
  
//-----------------------------------------------------
// Private methods
//-----------------------------------------------------

  _assertNode: function(elem, msg) {
    ASSERT(elem && Element.hasAnyClass(elem, this.classes.node), msg);
  },

  _assertNodeOrLeaf: function(elem, msg) {
    ASSERT(elem && Element.hasAnyClass(elem, this.classes.nodeOrLeaf), msg);
  },


  _labelMouseOverHandler: function(event, label) {
      Element.addClassName(label, this.classes.mouse);
      Event.stop(event);
  },

  _labelMouseOutHandler: function(event, label) {
    Element.removeClassName(label, this.classes.mouse);
    Event.stop(event);
  },
  
  _labelClickHandler : function(event, label) {
    var node  = Element.navigateDom(label, 'parentNode',
                                    this.classes.nodeOrLeaf);

    // situation before the click
    var was_selected = this.selectedNode == node;
    var now = (new Date()).getTime(); 
    var just_selected = (now - this._lastSelectTime < this.options.selectDelay);
 
    // select node if necessary
    if (!was_selected) this.select(node);

    // should ping : depends on options.noPingOnFirstClick
    var should_ping = (was_selected && !just_selected) 
                    || !this.options.noPingOnFirstClick;

    // do the ping if necessary
    var event_stop_mode;
    if (should_ping)
      event_stop_mode = this.fireEvent("Ping", node, this.rootElement);

    // avoid a second ping from the dblclick handler
    this.should_ping_on_dblclick = !should_ping; 

    // stop the event unless the ping_handler decided otherwise
    Event.detailedStop(event, event_stop_mode || Event.stopAll);
  },


  _labelDblClickHandler : function(event, label) {
    var event_stop_mode;

    // should_ping_on_dblclick was just set within _labelClickHandler
    if (this.should_ping_on_dblclick) {
      var node = label.parentNode;
      event_stop_mode = this.fireEvent("Ping", node, this.rootElement);
    }

    // stop the event unless the ping_handler decided otherwise
    Event.detailedStop(event, event_stop_mode || Event.stopAll);
  },


  _buttonClickHandler : function(event) {
    var node = Event.element(event).parentNode;
    var method = this.isClosed(node) ? this.open : this.close;
    method.call(this, node);
    if (this.options.selectOnButtonClick)
      this.select(node);
    Event.stop(event);
  },

  _addButtonsAndHandlers: function(labels) {
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      Event.observe(
        label,  "mouseover", 
        this._labelMouseOverHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "mouseout",  
        this._labelMouseOutHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "click",
        this._labelClickHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "dblclick",
        this._labelDblClickHandler.bindAsEventListener(this, label));
      if (this.options.createButtons) {
        var button = document.createElement("span");
        button.className = this.classes.button;
        label.parentNode.insertBefore(button, label);
        Event.observe(
          button, "click",     
          this._buttonClickHandler.bindAsEventListener(this, label));
      }
    }
  },

  _addTabbingBehaviour: function(labels) {
    if (this.options.tabIndex < 0) return; // no tabbing

    // focus and blur do not bubble, so we'll have to insert them
    // in each label element

    var treeNavigator = this; // handlers will be closures on this

    // focus handler
    var focus_handler = function(event) {
      var label = Event.element(event);
      label.setAttribute('hasFocus', true);

      var node  = Element.navigateDom(label, 'parentNode',
                                      treeNavigator.classes.nodeOrLeaf);
                                                 
      // Select, but only if focus was not the consequence of a select action!
      // To distinguish, we use the timestamp of the last select.
      var now = (new Date()).getTime(); 
      var short_delay = 2 * treeNavigator.options.selectDelay;
         // needed to multiply by 2 because focus() is called indirectly by 
         // _selectionTimeoutHandler after selectDelay milliseconds
      if (node && now - treeNavigator._lastSelectTime > short_delay)
        treeNavigator.select(node); 
    };

    // blur handler
    var blur_handler = function(event) {
      var label = Event.element(event);
      label.setAttribute('hasFocus', false);

      // Deselect, but only if blur was not the consequence of a select action!
      // To distinguish, we use the timestamp of the last select.
      var now = (new Date()).getTime(); 
      var short_delay = 2 * treeNavigator.options.selectDelay;
      if (now - treeNavigator._lastSelectTime > short_delay)
        treeNavigator.select(null);
    };

    // apply to each label
    labels.each(function(label) {
                  label.tabIndex = treeNavigator.options.tabIndex;
                  Event.observe(label, "focus", focus_handler);
                  Event.observe(label, "blur", blur_handler);
                });
  },


//-----------------------------------------------------
// timeout handler for firing Select/Deselect events
//-----------------------------------------------------

  _selectionTimeoutHandler: function(previousNode) {
    var now = (new Date()).getTime();
    var deltaDelay = this.options.selectDelay - (now - this._lastSelectTime);

    // if _lastSelectTime is too recent, re-schedule the same handler for later
    if (deltaDelay > 0) {
      var treeNavigator = this;
      var callback = function () {
        treeNavigator._selectionTimeoutHandler(previousNode);
      };

      this._selectionTimeoutId = 
        setTimeout(callback, deltaDelay + 100); // allow for 100 more milliseconds
    }

    // else do the real work
    else { 
      this._selectionTimeoutId = null;
      var newNode = this.selectedNode;

      // set focus
      if (newNode) {
        var label = this.label(newNode);
        if (label && this.options.tabIndex >= 0 
                  && !label.getAttribute('hasFocus') 
                  && this.isVisible(label)) {
            label.focus();
        }
      }

      // fire events
      if (previousNode != newNode) {
        if (previousNode) 
          this.fireEvent("Deselect", previousNode, this.rootElement);
        if (newNode)
          this.fireEvent("Select", newNode, this.rootElement);
      }
    }
  },


//-----------------------------------------------------
// Key handlers
//-----------------------------------------------------

  _downHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var nextNode = this.nextDisplayedNode(selectedNode);
      if (nextNode) {
        this.select(nextNode);
        Event.stop(event);
      }
      // otherwise: do nothing and let default behaviour happen
    }
  },

  _upHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var prevNode = this.previousDisplayedNode(selectedNode);
      if (prevNode) {
        this.select(prevNode);
        Event.stop(event);
      }
      // otherwise: do nothing and let default behaviour happen
    }
  },

  _leftHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (!this.isLeaf(selectedNode) && !this.isClosed(selectedNode)) { 
        this.close(selectedNode);
      } 
      else {
        var parent = this.parentNode(selectedNode); 
        if (parent) 
          this.select(parent); 
        else
          this.flash(selectedNode); 
      }
      Event.stop(event);
    }
  },

  _rightHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (this.isLeaf(selectedNode)) return;
      if (this.isClosed(selectedNode))
        this.open(selectedNode);
      else {
        var subNode = this.firstSubNode(selectedNode); 
        if (subNode) 
          this.select(subNode);
        else
          this.flash(selectedNode);
      }
      Event.stop(event);
    }
  },


  _tabHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && this.isClosed(selectedNode)) {
      this.open(selectedNode);
      var label = this.label(selectedNode);
      Event.stop(event);
    }
  },

  _kpPlusHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && this.isClosed(selectedNode)) {
      this.open(selectedNode);
      Event.stop(event);
    }
  },

  _kpMinusHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && !this.isClosed(selectedNode)) {
      this.close(selectedNode);
      Event.stop(event);
    }
  },

  _kpStarHandler: function (event) {
    var treeNavigator = this;
    var target = this.selectedNode || this.rootElement;
    var nodes = Element.getElementsByClassNames(target, this.classes.node);
    if (target == this.selectedNode) nodes.unshift(target);
    nodes.each(function(node) {treeNavigator.open(node)});
    Event.stop(event);
  },

  _kpSlashHandler: function (event) {
    var treeNavigator = this;
    var target = this.selectedNode || this.rootElement;
    var nodes = Element.getElementsByClassNames(target, this.classes.node);
    if (target == this.selectedNode) nodes.unshift(target);
    nodes.each(function(node) {treeNavigator.close(node)});
    Event.stop(event);
  },

  _ctrl_R_handler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (this.loadContent(selectedNode))
        Event.stop(event);
    }
  },

  _ReturnHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var toStop = this.fireEvent("Ping", selectedNode, this.rootElement);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _homeHandler: function (event) {
    if (this.selectedNode) {
        this.select(this.firstSubNode());
        Event.stop(event);
    }
  },

  _endHandler: function (event) {
    if (this.selectedNode) {
        this.select(this.lastVisibleSubnode());
        Event.stop(event);
    }
  },

  _ctrlPgUpHandler: function (event) {
    var node = this.enclosingNode(Event.element(event));
    if (node) this.select(node);
  },

  _ctrlPgDownHandler: function (event) {
    var node = this.enclosingNode(Event.element(event));
    if (node) {
      node = this.nextDisplayedNode(node);
      if (node) this.select(node);
    }
  },

  _chooseLevel: function(event) {
    var level = event.keyCode - "0".charCodeAt(0);
    this.openAtLevel(this.rootElement, level);
    
    // stop the default Ctrl-num event
    // FF: jump to tab#num
    // IE: Ctrl-5 Select-All
    Event.stop(event);
  },

  _showAll: function(event, toggle) {
    var method = toggle ? Element.addClassName : Element.removeClassName;
    method(this.rootElement, this.classes.showall);
  }

};

//----------choiceList.js

//----------------------------------------------------------------------
// CONSTRUCTOR
//----------------------------------------------------------------------

GvaScript.ChoiceList = function(choices, options) {
  if (! (choices instanceof Array) )
    throw new Error("invalid choices argument : " + choices);
  this.choices = choices;

  var defaultOptions = {
    labelField       : "label",
    classes          : {},        // see below for default classes
    idForChoices     : "CL_choice",
    keymap           : null,
    grabfocus        : false,
    scrollCount      : 5,
    choiceItemTagName: "div",
    htmlWrapper      : function(html) {return html;},
    paginator        : null
  };


  this.options = Class.checkOptions(defaultOptions, options);

  var defaultClasses = {
    choiceItem      : "CL_choiceItem",
    choiceHighlight : "CL_highlight"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);

  // handy vars
  this.hasPaginator = this.options.paginator != null;
  this.pageSize = (
                    // the step size of the paginator if any
                    (this.hasPaginator && this.options.paginator.options.step) 
                    ||  
                    // scroll count
                    this.options.scrollCount
                  );

  // prepare some stuff to be reused when binding to inputElements
  this.reuse = {
    onmouseover : this._listOverHandler.bindAsEventListener(this),
    onclick     : this._clickHandler.bindAsEventListener(this),
    navigationRules: {
      DOWN:      this._highlightDelta.bindAsEventListener(this, 1),
      UP:        this._highlightDelta.bindAsEventListener(this, -1),

      PAGE_DOWN: this._highlightDelta.bindAsEventListener(this, this.pageSize), 
      PAGE_UP:   this._highlightDelta.bindAsEventListener(this, -this.pageSize),

      HOME:      this._jumpToIndex.bindAsEventListener(this, 0),
      END:       this._jumpToIndex.bindAsEventListener(this, 99999), 

      RETURN:    this._returnHandler .bindAsEventListener(this),
      ESCAPE:    this._escapeHandler .bindAsEventListener(this)
    }
  };
  
  if(this.hasPaginator) {
    // next/prev page
    this.reuse.navigationRules.RIGHT  
        = this._highlightDelta.bindAsEventListener(this, this.pageSize)
    this.reuse.navigationRules.LEFT   
        = this._highlightDelta.bindAsEventListener(this, -this.pageSize);

    // first/last page
    this.reuse.navigationRules.C_HOME
        = this._jumpToPage.bindAsEventListener(this, 0);
    this.reuse.navigationRules.C_END  
        = this._jumpToPage.bindAsEventListener(this, 99999);
  }
};


GvaScript.ChoiceList.prototype = {

//----------------------------------------------------------------------
// PUBLIC METHODS
//----------------------------------------------------------------------

  fillContainer: function(containerElem) {

    this.container = containerElem;
    this.container.choiceList = this;
    
    Element.update(this.container, this.htmlForChoices());

    // mouse events on choice items will bubble up to the container
    Event.observe(this.container, "mouseover", this.reuse.onmouseover);
    Event.observe(this.container, "click"    , this.reuse.onclick);

    if (this.options.keymap) {
      this.keymap = this.options.keymap;
      this.keymap.rules.push(this.reuse.navigationRules);
    }
    else {
      this.keymap = new GvaScript.KeyMap(this.reuse.navigationRules);
      var target = this.container.tabIndex == undefined 
                     ? document
                     : this.container;
      this.keymap.observe("keydown", target);
    }
    // POTENTIAL PROBLEM HERE : the keymap may stay active
    // even after the choiceList is deleted (may yield memory leaks and 
    // inconsistent behaviour). But we have no "destructor", so how
    // can we unregister the keymap ?


    // highlight the first choice
    this._highlightChoiceNum(0, false);
  },

  updateContainer: function(container, list) {
    this.choices = list;
    Element.update(this.container, this.htmlForChoices());
    this._highlightChoiceNum(0, true);
  },

  htmlForChoices: function(){ // creates the innerHTML 
    var html = "";
    for (var i = 0; i < this.choices.length; i++) {
      var choice = this.choices[i];
      var label  = 
        typeof choice == "string" ? choice : choice[this.options.labelField];

      var id = this.container.id ? this.container.id + "." : '';
      id += this.options.idForChoices + "." + i;
      html += this.choiceElementHTML(label, id);
    }
    return this.options.htmlWrapper(html);
  },

  choiceElementHTML: function(label, id) {
    return "<" + this.options.choiceItemTagName + " class='" + this.classes.choiceItem +  "' id='" + id + "'>" 
           + label + "</" + this.options.choiceItemTagName + ">";
  },

  fireEvent: GvaScript.fireEvent, // must be copied here for binding "this" 


//----------------------------------------------------------------------
// PRIVATE METHODS
//----------------------------------------------------------------------


  //----------------------------------------------------------------------
  // conversion index <=> HTMLElement
  //----------------------------------------------------------------------

  _choiceElem: function(index) { // find DOM element from choice index
    var prefix = this.container.id ? this.container.id + "." : '';
    return $(prefix + this.options.idForChoices + "." + index);
  },

  _choiceIndex: function(elem) {
    return parseInt(elem.id.match(/\.(\d+)$/)[1], 10);
  },


  //----------------------------------------------------------------------
  // highlighting 
  //----------------------------------------------------------------------

  _highlightChoiceNum: function(newIndex, autoScroll) {

    // do nothing if newIndex is invalid
    if (newIndex > this.choices.length - 1) return;

    Element.removeClassName(this._choiceElem(this.currentHighlightedIndex), 
                            this.classes.choiceHighlight);
    this.currentHighlightedIndex = newIndex;
    var elem = this._choiceElem(newIndex);
    // not to throw an arrow when user is holding an UP/DN keys while 
    // paginating
    if(! $(elem)) return;

    Element.addClassName(elem, this.classes.choiceHighlight);

    if (autoScroll) 
      Element.autoScroll(elem, this.container, 30); // 30%

    this.fireEvent({type: "Highlight", index: newIndex}, elem, this.container);
  },

  // this method restricts navigation to the current page
  _jumpToIndex: function(event, nextIndex) {
    var autoScroll = event && event.keyName; // autoScroll only for key events

    this._highlightChoiceNum(
        Math.max(0, Math.min(this.choices.length-1, nextIndex)), 
        autoScroll
    );
                             
    if (event) Event.stop(event);
  },

  
  // TODO: jump to page numbers would be a nice addition 
  _jumpToPage: function(event, pageIndex) {
    if(pageIndex <=1) return this.options.paginator.getFirstPage();
    if(pageIndex == 99999) return this.options.paginator.getLastPage();
    
    if (event) Event.stop(event);
  },

  // would navigate through pages if index goes out of bound
  _highlightDelta: function(event, deltax, deltay) {
    var currentIndex = this.currentHighlightedIndex;
    var nextIndex    = currentIndex + deltax;
    
    // first try to flip a page
    // if first page -> go top of list
    if (nextIndex < 0) {
        if(this.hasPaginator) {
            if(this.options.paginator.getPrevPage()) return;
        }
        nextIndex = 0;
    }

    if (nextIndex >= this.choices.length) {
        if(this.hasPaginator) {
            if(this.options.paginator.getNextPage()) return; 
        }
        nextIndex = this.choices.length -1;
    }
    
    // we're still on the same page
    this._jumpToIndex(event, nextIndex);
  },

  //----------------------------------------------------------------------
  // navigation 
  //----------------------------------------------------------------------

  _findChoiceItem: function(event) { // walk up DOM to find mouse target
    var stop_condition = function(elem){return elem === this.container};
    return Element.navigateDom(Event.element(event), "parentNode",
                               this.classes.choiceItem,
                               stop_condition);
  },

  _listOverHandler: function(event) {
    var elem = this._findChoiceItem(event);
    if (elem) {
      this._highlightChoiceNum(this._choiceIndex(elem), false);
      if (this.options.grabfocus)
        this.container.focus();
      Event.stop(event);
    }
  },

  // no _listOutHandler needed

  _clickHandler: function(event) {
    var elem = this._findChoiceItem(event);
    if (elem) {
      var toStop = this.fireEvent({type : "Ping", 
                                   index: this._choiceIndex(elem)}, 
                                  elem, 
                                  this.container);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _returnHandler: function(event) {
    var index = this.currentHighlightedIndex;
    if (index != undefined) {
      var elem = this._choiceElem(index);
      var toStop = this.fireEvent({type : "Ping", 
                                   index: index}, elem, this.container);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _escapeHandler: function(event) {
    var toStop = this.fireEvent("Cancel", this.container);
    Event.detailedStop(event, toStop || Event.stopAll);
  }

};


//----------autoCompleter.js
/** 

  PROBLEMS:
    - autoSuggestDelay not used
    - autoSuggest, cannot BACKSPACE

  TEST :
    - choices as arrays instead of objects

TODO: 
  - if ignorePrefix, should highlight current value (not the 1st one)
      a) change in _updateChoicesFunction (because there might be an
         initial value in the form)



  - messages : choose language

  - multivalue :
     - inconsistent variable names
     - missing doc

  - rajouter option "hierarchicalValues : true/false" (si true, pas besoin de
    refaire un appel serveur quand l'utilisateur rajoute des lettres).

 - typeAhead only works when autoSuggest is true !


  - sometimes arrowDown should force Ajax call even if < minChars

  - do a demo with 
     http://suggestqueries.google.com/complete/search?q=**&output=firefox  - 

  - choiceElementHTML

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
    autoSuggestDelay : 100,       // milliseconds, (OBSOLETE)
    checkNewValDelay : 100,       // milliseconds
    typeAhead        : true,      // will fill the inputElement on highlight
    classes          : {},        // see below for default classes
    maxHeight        : 200,       // pixels
    minWidth         : 200,       // pixels
    offsetX          : 0,         // pixels
    strict           : false,     // will complain on illegal values
    blankOK          : true,      // if strict, will also accept blanks
    colorIllegal     : "red",     // background color when illegal values
    scrollCount      : 5,
    multivalued      : false,
    multivalue_separator :  /[;,\s]\s*/,
    choiceItemTagName: "div",
    htmlWrapper      : function(html) {return html;},
    observed_scroll  : null,      // observe the scroll of a given element and 
                                  // move the dropdown accordingly (useful in 
                                  // case of scrolling windows)
    additional_params: null,      // additional parameters with optional default
                                  // values (only in the case where the 
                                  // datasource is a URL)
    http_method      : 'get',     // method for Ajax requests
    dependentFields  : {},
    deltaTime_tolerance : 50      // added msec. for imprecisions in setTimeout

  };

  // more options for array datasources
  if (typeof datasource == "object" && datasource instanceof Array) { 
    defaultOptions.ignorePrefix  = false;  // if true, will always display 
                                           // the full list
    defaultOptions.caseSensitive = true;
  }

  this.options = Class.checkOptions(defaultOptions, options);

  // backwards compatibility
  this.options.checkNewValDelay = this.options.autoSuggestDelay;

  var defaultClasses = {
    loading         : "AC_loading",
    dropdown        : "AC_dropdown",
    message         : "AC_message"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);
  
  if (this.options.multivalued && this.options.strict) {
    throw new Error("options 'strict' and 'multivalue' are incompatible");
  }

  this.dropdownDiv = null;

  this.setdatasource(datasource);

  // prepare an initial keymap; will be registered at first
  // focus() event; then a second set of keymap rules is pushed/popped
  // whenever the choice list is visible
  var basicHandler = this._keyDownHandler.bindAsEventListener(this);
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
    this._timeLastCheck = this._timeLastKeyDown = 0;

    // more initialization, but only if we did not just come back from a 
    // click on the dropdownDiv
    if (!this.dropdownDiv) {
      this.lastTypedValue = this.lastValue = "";
      this.choices = null;
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
    if(_div = this._mkDropdownDiv()) {
      _div.innerHTML = message;
      Element.addClassName(_div, this.classes.message);
    }
  },

  // set additional params for autocompleters that have more than 1 param;
  // second param is the HTTP method (post or get)
  // DALNOTE 10.01.09 : pas de raison de faire le choix de la  m�thode HTTP
  // dans  setAdditionalParams()! TOFIX. Apparemment, utilis� une seule fois 
  // dans DMWeb (root\src\tab_composition\form.tt2:43)
  setAdditionalParams : function(params, method) {
    this.additional_params = params;           
    if (method) this.options.http_method = method;
  },

  addAdditionalParam : function(param, value) {
    if (!this.additional_params) 
      this.additional_params = {};
    this.additional_params[param] = value;
  },

  setdatasource : function(datasource) {

    // remember datasource in private property
    this._datasource = datasource;

    // register proper "updateChoices" function according to type of datasource
    var ds_type = typeof datasource;
    this._updateChoicesHandler 
      = (ds_type == "string")   ? this._updateChoicesFromAjax
      : (ds_type == "function") ? this._updateChoicesFromCallback
      : (ds_type == "object" && datasource instanceof Array) 
                                ? this._updateChoicesFromArray 
      : undefined;
     if (!this._updateChoicesHandler)
      throw new Error("unexpected datasource type");
  },

  // 'fireEvent' function is copied from GvaScript.fireEvent, so that "this" 
  // in that code gets properly bound to the current object
  fireEvent: GvaScript.fireEvent, 

  // Set the element for the AC to look at to adapt its position. If elem is
  // null, stop observing the scroll.
  // DALNOTE 10.01.09 : pas certain de l'utilit� de "set_observed_scroll"; si 
  // l'�l�ment est positionn� correctement dans le DOM par rapport � son parent,
  // il devrait suivre le scroll automatiquement. N'est utilis� dans DMWeb que
  // par "avocat.js".
  set_observed_scroll : function(elem) {
    if (!elem) {
        Event.stopObserving(this.observed_scroll, 'scroll', 
                            correct_dropdown_position);
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

    Event.observe(elem, 'scroll', 
                  correct_dropdown_position.bindAsEventListener(this));
  },


//----------------------------------------------------------------------
// PRIVATE METHODS
//----------------------------------------------------------------------

  _updateChoicesFromAjax: function (val_to_complete, continuation) {

    // copies into local variables, needed for closures below (can't rely on 
    // 'this' because 'this' may have changed when the ajax call comes back)
    var autocompleter = this; 
    var inputElement  = this.inputElement;

    inputElement.style.backgroundColor = ""; // remove colorIllegal
    if (this._runningAjax)
      this._runningAjax.transport.abort();
    Element.addClassName(inputElement, this.classes.loading);
    
    var complete_url = this._datasource + val_to_complete;
    this._runningAjax = new Ajax.Request(
      complete_url,
      {asynchronous: true,
       method: this.options.http_method,
       parameters: this.additional_params, // for example {C_ETAT_AVOC : 'AC'}

       // DALNOTE 10.01.09: forcer du JSON dans le body du POST est sp�cifique 
       // DMWeb; pour le cas g�n�ral il faut pouvoir envoyer du 
       // x-www-form-urlencoded ordinaire
       postBody: this.options.http_method == 'post'
                     ? Object.toJSON(this.additional_params) 
                     : null,

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
          autocompleter.displayMessage("pas de r�ponse du serveur");
       },
       onComplete: function(xhr) {
          Element.removeClassName(inputElement, 
                                  autocompleter.classes.loading);
       }
      });
  },

  _updateChoicesFromCallback : function(val_to_complete, continuation) {
     continuation(this._datasource(val_to_complete));
  },


  _updateChoicesFromArray : function(val_to_complete, continuation) {
    if (this.options.ignorePrefix)
        continuation(this._datasource);
    else {
      var regex = new RegExp("^" + val_to_complete,
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


  _updateChoices : function (continuation) {
    var value = this._getValueToComplete();

    if (window.console) console.log('updateChoices', value);

    this._updateChoicesHandler(value, continuation);
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


    if (window.console) console.log('blurHandler', value);    

    // abort any pending ajax call
    if (this._runningAjax) {
      this._runningAjax.transport.abort();
      Element.removeClassName(this.inputElement, this.classes.loading);
    }

    // if strict mode, inform client about the final status
    if (this.options.strict) {
      var value = this._getValueToComplete();

      // if value has changed, invalidate previous list of choices
      if (value != this.lastValue) {
        this.choices = null; 
      }

      // if blank and blankOK, this is a legal value
      if (!value && this.options.blankOK) {
        this._updateDependentFields(this.inputElement, "");
        this.fireEvent({ type       : "LegalValue", 
                         value      : "", 
                         choice     : null,
                         controller : null  }, this.inputElement);
      }

      // if choices are known, just inspect status
      else if (this.choices) {            
        this._fireFinalStatus(this.inputElement, this.choices);
      }

      // if not enough chars to get valid choices, this is illegal
      else if (value.length < this.options.minimumChars) {    
        this.inputElement.style.backgroundColor = this.options.colorIllegal;
        this._updateDependentFields(this.inputElement, null);
        this.fireEvent({type: "IllegalValue", value: value}, 
                       this.inputElement);
      }

      // otherwise get choices and then inspect status (maybe asynchronously)
      else  {
        this._updateChoices(this._fireFinalStatus.bind(this, 
                                                       this.inputElement));
      }
    }

    this.fireEvent("Leave", this.inputElement);
    this.inputElement = null;
  },

  _fireFinalStatus: function (inputElement, choices) {
  // NOTE: takes inputElement and choices as arguments, because it might be
  // called asynchronously, after "this" has been detached from the input
  // element and the choices array, so we cannot call the object properties.

    var input_val = this._getValueToComplete(inputElement.value);

    var index = null;

    // inspect the choice list to automatically choose the appropriate candidate
    for (var i=0; i < choices.length; i++) {
        var val = this._valueFromChoiceItem(choices[i]);
        
        if (val == input_val) {
            index = i;
            break; // break the loop because this is the best choice
        }
        else if (val.toUpperCase() == input_val.toUpperCase()) {
            index = i;  // is a candidate, but we may find a better one
        }
    }

    // if automatic choice did not work, but we have only 1 choice, and this is
    // not blank on purpose, then force it into the field
    if (index === null && choices.length == 1 
                       && (input_val || !this.options.blankOK )) 
        index = 0;
        
    if (index !== null) {
        var choice = choices[index];
        var val = this._valueFromChoiceItem(choice);

        // put canonical value back into input field
        this._setValue(val, inputElement);

        // for backwards compatibility, we generate a "Complete" event, but
        // with a fake controller (as the real controller might be in a 
        // diffent state).
        this.fireEvent({ type      : "Complete",
                         referrer  : "blur",    // input blur fired this event 
                         index     : index,
                         choice    : choice,
                         controller: {choices: choices} }, inputElement);

        // update dependent fields
        this._updateDependentFields(inputElement, choice);

        // for new code : generate a "LegalValue" event
        this.fireEvent({ type       : "LegalValue", 
                         value      : val, 
                         choice     : choice,
                         controller : null  }, inputElement);

    }
    else {
        inputElement.style.backgroundColor = this.options.colorIllegal;
        this._updateDependentFields(inputElement, null);
        this.fireEvent({ type       : "IllegalValue", 
                         value      : input_val, 
                         controller : null  }, inputElement);
    }
  },

  _updateDependentFields: function(inputElement, choice) {
        // "choice" might be 
        //   - an object or nonempty string ==> update dependent fields
        //   - an empty string              ==> clear dependent fields
        //   - null                         ==> put "ILLEGAL_***" 
        var attr       = inputElement.getAttribute('ac:dependentFields');
        var dep_fields = attr ? eval("("+attr+")") 
                              : this.options.dependentFields;
        if (!dep_fields) return;

        var form       = inputElement.form;
        var name_parts = inputElement.name.split(/\./);
        
        for (var k in dep_fields) {
            name_parts[name_parts.length - 1] = k;
            var related_name    = name_parts.join('.');
            var related_field   = form[related_name];
            var value_in_choice = dep_fields[k];
            if (related_field) {
                related_field.value
                    = (value_in_choice == "")        ? ""
                    : (choice === null)              ? "!!ILLEGAL_" + k + "!!"
                    : (typeof choice == "object")    ? choice[value_in_choice]
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
      this.displayMessage("liste de choix � partir de " 
                            + this.options.minimumChars + " caract�res");
    else 
      this._displayChoices();
    Event.stop(event);
  },



  _keyDownHandler: function(event) { 

    // invalidate previous lists of choices because value may have changed
    this.choices = null; 
    this._removeDropdownDiv();

    // cancel pending timeouts because we create a new one
    if (this._timeoutId) clearTimeout(this._timeoutId);

    this._timeLastKeyDown = (new Date()).getTime(); 
    if (window.console) console.log('keyDown', this._timeLastKeyDown, event.keyCode); 
    this._timeoutId = setTimeout(this._checkNewValue.bind(this), 
                                 this.options.checkNewValDelay);

    // do NOT stop the event here : give back control so that the standard 
    // browser behaviour can update the value; then come back through a 
    // timeout to update the Autocompleter
  },



  _checkNewValue: function() { 
        
    // abort if the timeout occurs after a blur (no input element)
    if (!this.inputElement) {
      if (window.console) console.log('_checkNewValue ... no input elem');
      return; 
    }

    // several calls to this function may be queued by setTimeout,
    // so we perform some checks to avoid doing the work twice
    if (this._timeLastCheck > this._timeLastKeyDown) {
      if (window.console) console.log('_checkNewValue ... done already ', 
                  this._timeLastCheck, this._timeLastKeyDown);
      return; // the work was done already
    }

    var now = (new Date()).getTime();

    var deltaTime = now - this._timeLastKeyDown;
    if (deltaTime + this.options.deltaTime_tolerance 
          <  this.options.checkNewValDelay) {
      if (window.console) console.log('_checkNewValue ... too young ',
                                      now, this._timeLastKeyDown);
      return; // too young, let olders do the work
    }


    this._timeLastCheck = now;
    var value = this._getValueToComplete();
    if (window.console) 
        console.log('_checkNewValue ... real work [value = %o]  - [lastValue = %o] ', 
                             value, this.lastValue);
    this.lastValue = this.lastTypedValue = value;

    // create a list of choices if we have enough chars
    if (value.length >= this.options.minimumChars) {

        // first create a "continuation function"
        var continuation = function (choices) {

          // if, meanwhile, another keyDown occurred, then abort
          if (this._timeLastKeyDown > this._timeLastCheck) {
            if (window.console) 
              console.log('after updateChoices .. abort because of keyDown',
                          now, this._timeLastKeyDown);
            return;
          }
          
          this.choices = choices;
          if (choices && choices.length > 0) {
            this.inputElement.style.backgroundColor = ""; // remove colorIllegal
            if (this.options.autoSuggest)
              this._displayChoices();
          }
          else if (this.options.strict && 
                   (value || !this.options.blankOK)) {
            this.inputElement.style.backgroundColor 
            = this.options.colorIllegal;
          }
        };

        // now call updateChoices (which then will call the continuation)
        this._updateChoices(continuation.bind(this));
      }
  },


  // return the value to be completed
  // TODO : for multivalued, should return the value under the cursor,
  // instead returning sytematically the last value
  _getValueToComplete : function(value) {
     // NOTE: the explicit value as argument is only used from 
     //_fireFinalStatus(), when we can no longer rely on 
     // this.inputElement.value
    value = value || this.inputElement.value;
    if (this.options.multivalued) {
      var vals = value.split(this.options.multivalue_separator);
      value    = vals[vals.length-1];
    }
    return value;
  },

  _setValue : function(value, inputElement) {              
        // NOTE: the explicit inputelement as argument is only used from 
        // _fireFinalStatus(), when we can no longer rely on this.inputElement

    if (!inputElement) inputElement = this.inputElement;

    if (this.options.multivalued && 
        inputElement.value.match(this.multivalue_separator)) {

      // user-chosen char(s) for separating values
      var user_sep = RegExp.$1;

      // replace last value by the one received as argument
      var vals = inputElement.value.split(this.multivalue_separator);
      vals[vals.length-1] = value;      
      value = vals.join(user_sep);
    }

    // setting value in input field
    inputElement.value = this.lastValue = value;
  },



  _typeAhead : function () {
    var curLen     = this.lastTypedValue.length;
    var index      = this.choiceList.currentHighlightedIndex; 
    var suggestion = this._valueFromChoice(index);
    var newLen     = suggestion.length;
    this._setValue(suggestion);

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

    // the autocompleter has been blurred ->
    // do not display the div
    if(!this.inputElement) return null;

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

      // code below would seem to make sense but loops forever in MSIE 6
//       div.style.setExpression("width", 
//         "this.scrollWidth<" + this.options.minWidth + "?" 
//                             + this.options.minWidth + ":'auto'");
      // so a simple fallback solution 
      div.style.width  = this.options.minWidth + "px"; 
    }

    return this.dropdownDiv = div;
  },



  _displayChoices: function() {

    // if no choices are ready, can't display anything
    if (!this.choices) return;

    var toCompleteVal = this._getValueToComplete();

    if (this.choices.length > 0) {
      var ac = this;

      // create a choiceList
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
      cl.keymap.rules[0].TAB = cl.keymap.rules[0].S_TAB = function(event) {
        var index = cl.currentHighlightedIndex;
        if (index != undefined) {

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
    if (!this.choices) return null;
    var choice = this.choices[index];
    return (choice !== null) ? this._valueFromChoiceItem(choice) : null;
  },

  _valueFromChoiceItem: function(choice) {
    return (typeof choice == "string") ? choice 
                                       : choice[this.options.valueField];
  },



  //triggered by the onPing event on the choicelist, i.e. when the user selects
  //one of the choices in the list
  _completeFromChoiceElem: function(elem) {
    // identify the selected line and handle it
    var num = parseInt(elem.id.match(/\.(\d+)$/)[1], 10);

    // add the value to the input element
    var value = this._valueFromChoice(num);
    if (value !== null) {
      this._setValue(value)
      this._removeDropdownDiv();
      if (!this.options.multivalued) {
        this.inputElement.select();
      } 

      this.fireEvent({ type      : "Complete",
                       referrer  : "select",    // choice selection fired this event 
                       index     : num,
                       choice    : this.choices[num],
                       controller: {choices: this.choices} }, elem, this.inputElement);
    }
  }

}

 
//----------repeat.js
/* TODO :
    - invent syntax for IF blocks (first/last, odd/even)
*/

GvaScript.Repeat = {

//-----------------------------------------------------
// Public methods
//-----------------------------------------------------

  init: function(elem) {
    this._init_repeat_elements(elem);
  },

  add: function(repeat_name, count) {
    if (count == undefined) count = 1;

    // get repeat properties
    var placeholder = this._find_placeholder(repeat_name);
    var repeat      = placeholder.repeat;
    var path_ini    = repeat.path;

    // regex substitutions to build html for the new repetition block (can't
    // use Template.replace() because we need structured namespaces)
    var regex       = new RegExp("#{" + repeat.name + "\\.(\\w+)}", "g");
    var replacement = function ($0, $1){var s = repeat[$1]; 
                                        return s == undefined ? "" : s};

    while (count-- > 0 && repeat.count < repeat.max) {
      // increment the repetition block count and update path
      repeat.ix    = repeat.count++;  // invariant: count == ix + 1
      repeat.path  = path_ini + "." + repeat.ix;

      // compute the HTML
      var html  = repeat.template.replace(regex, replacement);

      // insert into the DOM
      placeholder.insert({before:html});
      var insertion_block = $(repeat.path);
  
      // repetition block gets an event
      placeholder.fireEvent("Add", insertion_block);

      // deal with nested repeated sections
      this._init_repeat_elements(insertion_block, repeat.path);

      // restore initial path
      repeat.path = path_ini;
    }

    return repeat.count;
  },

  remove: function(repetition_block) {
    // find element, placeholder and repeat info
    var elem = $(repetition_block);
    elem.id.match(/(.*)\.(\d+)$/);
    var repeat_name = RegExp.$1;
    var remove_ix   = RegExp.$2;
    var placeholder = this._find_placeholder(repeat_name);
    var max         = placeholder.repeat.count;

    // remove the repeat block and all blocks above
    for (var i = remove_ix; i < max; i++) {
      var block = $(repeat_name + "." + i);
      placeholder.fireEvent("Remove", block);
      block.remove();
      placeholder.repeat.count -= 1;
    }        

    // add again the blocks above (which will be renumbered)
    var n_add = max - remove_ix - 1;
    if (n_add > 0) this.add(placeholder, n_add);
  },



//-----------------------------------------------------
// Private methods
//-----------------------------------------------------

  _find_placeholder: function(name) {
    if (typeof name == "string" && !name.match(/.placeholder$/))
        name += ".placeholder";
    var placeholder = $(name); 
    if (!placeholder) throw new Error("no such element: " + name);
    return placeholder;
  },

  _init_repeat_elements: function(elem, path) {
    elem = $(elem);
    if (elem) {
      var elements = this._find_repeat_elements(elem);
      for (var i = 0; i < elements.length; i++) {
        this._init_repeat_element(elements[i], path);
      }
    }
  },

  _find_repeat_elements: function(elem) {
    var result = [];

    // navigate DOM, do not recurse under "repeat" nodes
    for (var child = elem.firstChild; child; child = child.nextSibling) {
      var has_repeat = child.nodeType == 1 && child.getAttribute('repeat');
      result.push(has_repeat ? child : this._find_repeat_elements(child));
    }
    return result.flatten();
  },

  _init_repeat_element: function(element, path) {
    element = $(element);
    path = path || element.getAttribute('repeat-prefix');

    // number of initial repetition blocks
    var n_blocks = element.getAttribute('repeat-start');
    if (n_blocks == undefined) n_blocks = 1;

    // hash to hold all properties of the repeat element
    var repeat = {};
    repeat.name  = element.getAttribute('repeat');
    repeat.min   = element.getAttribute('repeat-min') || 0;
    repeat.max   = element.getAttribute('repeat-max') || 99;
    repeat.count = 0;
    repeat.path  = (path ? path + "." : "") + repeat.name;

    // create a new element (placeholder for new insertion blocks)
    var placeholder_tag = element.tagName.match(/^(TR|TD|TBODY|THEAD|TH)$/i) 
                          ? element.tagName 
                          : 'SPAN';
    var placeholder     = document.createElement(placeholder_tag);
    placeholder.id = repeat.path + ".placeholder";
    placeholder.fireEvent = GvaScript.fireEvent;
    element.parentNode.insertBefore(placeholder, element);

    // take this elem out of the DOM and into a string ...
    {
      // a) force the id that will be needed in the template)
      element.id = "#{" + repeat.name + ".path}";

      // b) remove "repeat*" attributes (don't want them in the template)
      var attrs = element.attributes;
      var repeat_attrs = [];
      for (var i = 0; i < attrs.length; i++) {
        var name = attrs[i].name;
        if (name.match(/^repeat/i)) repeat_attrs.push(name);
      }
      repeat_attrs.each(function(name){element.removeAttribute(name, 0)});

      // c) keep it as a template string and remove from DOM
      repeat.template = Element.outerHTML(element);
      element.remove();
    }

    // store all properties within the placeholder
    placeholder.repeat = repeat;

    // create initial repetition blocks 
    this.add(placeholder, n_blocks);
  }

};

//----------form.js
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

GvaScript.Form = {

  init: function(form, tree) {
    GvaScript.Repeat.init(form);
    if (tree)
      this.fill_from_tree(form, "", tree);
    this.autofocus(form);
  },


  to_hash: function(form) {
    return $(form).serialize({hash:true});
  },


  to_tree: function(form) {
    return this.expand_hash(this.to_hash(form));
  },


  fill_from_tree : function(form, field_prefix, tree) {
    form = $(form);
    for (var key in tree) {
      if (!tree.hasOwnProperty(key)) 
        continue;
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
          this._fill_from_value(elem, val); 
        break;

      case "object":
        if (val instanceof Array) 
          this._fill_from_array(form, new_prefix, val);
        else 
          this.fill_from_tree(form, new_prefix, val);
        break;

      case "function":
      case "undefined":
        // do nothing
      }
    }
  },


  _fill_from_array: function(form, field_prefix, array) {
    for (var i=0; i < array.length; i++) {
      var new_prefix = field_prefix + "." + i;

      // if form has a corresponding named element, fill it
      var elem = form[new_prefix];
      if (elem)
        this._fill_from_value(elem, array[i]);

      // otherwise try to walk down to a repetition block
      else {

        // try to find an existing repetition block
        elem = $(new_prefix); // TODO : check: is elem in form ?

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
          this.fill_from_tree(form, new_prefix, array[i]);
      }           
    }
  },



  _fill_from_value: function(elem, val) {
        // IMPLEMENTATION NOTE : Form.Element.setValue() is quite similar,
        // but our treatment of arrays is different, so we have to reimplement

    // force val into an array
    if (!(val instanceof Array)) val = [val]; 

    // get element type (might be a node list, which we call "collection")
    var elem_type = elem.type 
                 || (elem.length !== undefined ? "collection" : "unknown");

    switch (elem_type) {
      case "collection":
        for (var i=0; i < elem.length; i++) {
          this._fill_from_value(elem.item(i), val);
        }
        break;

      case "checkbox" :
      case "radio":
        elem.checked = val.include(elem.value);
        break;

      case "text" :
      case "textarea" :
      case "hidden" :
        elem.value = val.join(",");
        break;

      case "select-one" :
      case "select-multiple" :
        $A(elem.options).each(function(opt){
          var opt_value = Form.Element.Serializers.optionValue(opt);
          opt.selected = val.include(opt_value);
        });
        break;

      default:
        throw new Error("unexpected elem type : " + elem.type);
    } // end switch
  }, // end function


  // javascript version of Perl  CGI::Expand::expand_hash
  expand_hash: function(flat_hash) {
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
  }, 


  add: function(repeat_name, count) {
    var n_blocks = GvaScript.Repeat.add(repeat_name, count);
    var last_block = repeat_name + "." + (n_blocks - 1);
    this.autofocus(last_block);
  },

  remove: function(repetition_block) {
    // find element and repeat info
    var elem = $(repetition_block);
    elem.id.match(/(.*)\.(\d+)$/);
    var repeat_name = RegExp.$1;
    var remove_ix   = RegExp.$2;
    var form        = elem.up('form');

    // get form data corresponding to the repeated section (should be an array)
    var tree  = this.to_tree(form);
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
    this.fill_from_tree(form, repeat_name, tree);
  },

  autofocus: function(elem) {
    elem = $(elem);
    if (elem) {
      var target = elem.down('[autofocus]');
      // TODO : check if target is visible
      if (target) try {target.focus()} 
                     catch(e){}
    }
  }


};
