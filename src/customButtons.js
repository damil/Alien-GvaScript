GvaScript.CustomButtons = {};

GvaScript.CustomButtons.Button = Class.create();
// Renders Buttons in the following HTML structure
// <span class="dmweb-btn-container">
//         <span class="left"/>
//         <span class="center">
//                 <button accesskey="c" class="btn" style="width: auto;" id="btn_1227001526005">
//                         <em>C</em>réer un nouveau justiciable
//                 </button>
//         </span>
//         <span class="right"/>
// </span>
Object.extend(GvaScript.CustomButtons.Button.prototype, function() {
    var bcss = CSSPREFIX();

    function _extendCss(button_options) {
        // basic class
        var button_css = bcss+'-btn-container';
        
        // extended classes
        switch (typeof button_options.css) {
            case 'object': button_css += (' ' + button_options.css.join(' ')); break;
            case 'string': button_css += (' ' + button_options.css); break;
            default: break;
        }
        button_options.button_css = button_css;
    }
    var _button_template = new Template(
          '<span class="#{button_css}" id="#{id}">'  
        + '<span class="left"></span>'
        + '<span class="center">'
            + '<button type="#{type}" style="width:#{width}" '
            + ' class="btn" accesskey="#{accesskey}">#{label}'
            + '</button>'
        + '</span>'
        + '<span class="right"></span>'
        + '</span>'
    );
    function _render(button_options) {
        _extendCss(button_options);
        return _button_template.evaluate(button_options);
    }
    function _evalCondition(button_condition) {
        if(typeof button_condition == 'function') return button_condition();
        else
        if(eval(button_condition)) return true;
        else                       return false;
    }
    return {
        initialize: function(container, options) {
            var defaults = {
                id: 'btn_' + (new Date()).getTime(),
                callback: Prototype.emptyFunction,
                accesskey: ' ',
                condition: true,
                width: 'auto',
                type: 'button',
                label: 'GVA_SCRIPT_BUTTON'
            };
            this.options = Object.extend(defaults, options || {});
            
            if(_evalCondition(this.options.condition)) {
                this.container = $(container);
                this.container.insert(_render(this.options));
                this.btnContainer = $(this.options.id); // the outer <span/>

                this.btnElt = this.btnContainer.down('.btn'); // the <button/>

                // setting inline style on the button container
                if(typeof this.options.style != 'undefined') {
                    this.btnContainer.setStyle(this.options.style);
                }
                
                this.btnElt.observe('click', this.options.callback.bind(this.btnElt));
            }
        }
    }
}());

GvaScript.CustomButtons.ButtonNavigation = Class.create();
Object.extend(GvaScript.CustomButtons.ButtonNavigation.prototype, function() {
        // private members
        function _leftHandler(event) {
            var selectedBtn = this.selectedBtn;
            if (selectedBtn) {
                var nextBtn = this.previousBtn(selectedBtn);

                if (nextBtn) this.select(nextBtn);
                else         selectedBtn.flash(); 

                Event.stop(event);
            }
        }
        function _rightHandler(event) {
            var selectedBtn = this.selectedBtn;
            if (selectedBtn) {
                var prevBtn = this.nextBtn(selectedBtn);

                if (prevBtn) this.select(prevBtn);
                else         selectedBtn.flash(); 

                Event.stop(event);
            }
        }
        function _tabHandler(event) {
            if (this.options.preventListBlur)
                if (this.isLast(this.selectedBtn))
                    Event.stop(event);
        }
        function _shiftTabHandler(event) {
            if (this.options.preventListBlur)
                if (this.isFirst(this.selectedBtn))  
                    Event.stop(event);
        }
        function _homeHandler(event) {
            if (this.selectedBtn) {
                this.select(this.firstBtn());
                Event.stop(event);
            }
        }
        function _endHandler(event) {
            if (this.selectedBtn) {
                this.select(this.lastBtn());
                Event.stop(event);
            }
        }
        function _addHandlers() {
            this.buttons.each(function(btnContainer) {
                var btn;
                // if the button is a GvaScript.CustomButtons.BUTTON, then the actual <button> element 
                // will be embedded and selectable via .btn classname:
                // <span class="dmweb_btn-container">
                //         <span class="left"/>
                //         <span class="center">
                //                 <button accesskey="r" class="btn" style="width: auto;" id="btn_1226916357164">
                //                         <em>R</em>echercher dans Calvin
                //                 </button>
                //         </span>
                //         <span class="right"/>
                // </span>
                // this will be cleaner when all application buttons are transformed into
                // GvaScript.CustomButtons.Button instances
                if(btnContainer.tagName.search(/^(INPUT|BUTTON)$/i) > -1) btn = btnContainer; 
                else {
                    btn = btnContainer.down('.btn');
                    btn.visible        = function() {return btnContainer.visible();}
                    // support focus function on span.buttonContainer
                    btnContainer.focus = function() {btn.focus();}
                }
                
                if(typeof btn == 'undefined') return;
                
                btnContainer.observe("mouseover", (function() {btnContainer.addClassName("btn-hover")}));
                btnContainer.observe("mouseout",  (function() {btnContainer.removeClassName("btn-hover")}));

                btn.observe("focus", this.select.bind(this, btnContainer));
                btn.observe("blur",  this.select.bind(this, null));
            }, this);
        }

        // public members
        return {
            initialize: function(container, options) {
                var defaults = {
                    preventListBlur     : false,
                    flashDuration       : 100,     // milliseconds
                    flashClassName      : 'flash',
                    keymap              : null,
                    selectFirstBtn      : true,
                    className           : 'BN_button'
                };
                this.options   = Object.extend(defaults, options || {});
                this.container = $(container); 
                
                // initializing the keymap
                var keyHandlers = {
                    LEFT:       _leftHandler     .bindAsEventListener(this),
                    RIGHT:      _rightHandler    .bindAsEventListener(this),
                    TAB:        _tabHandler      .bindAsEventListener(this),
                    S_TAB:      _shiftTabHandler .bindAsEventListener(this),
                    HOME:       _homeHandler     .bindAsEventListener(this),
                    END:        _endHandler      .bindAsEventListener(this)
                };
                this.keymap = new GvaScript.KeyMap(keyHandlers);
                this.keymap.observe("keydown", container, {
                    preventDefault:false, 
                    stopPropagation:false
                });

                // get all buttons of designated className regardless of their
                // visibility jump over hidden ones when navigating
                this.buttons = this.container.select('.'+this.options.className);
                _addHandlers.apply(this);
                
                if (this.options.selectFirstBtn) {
                    if(firstButObj = this.firstBtn()) {
                        this.select.defer(firstButObj);
                    }
                    // set the focus on the container anyways so that the focus
                    // gets trasferred successfully to windows with empty
                    // actionsbar
                    else {
                        this.container.writeAttribute('tabindex', 0);
                        this.container.focus();
                    }
                }
            },
            select: function (btn) {
                var previousBtn = this.selectedBtn || null;
                if (previousBtn == btn) return; // selection already handled
                
                // blur the previously selected button 
                if (previousBtn) {
                    previousBtn.removeClassName('btn-focus');
                }
                this.selectedBtn = btn;
                if (btn) {
                    btn.addClassName('btn-focus');
                    try {
                        if(btn.tagName.search(/^(INPUT|BUTTON)$/i) > -1) 
                            btn.focus();
                        else                                             
                            btn.down('.btn').focus();
                    } catch (err) {}
                }
            },
            // returns the next visible button 
            // null if none exists
            nextBtn: function (btn) {
                var _idx = this.buttons.indexOf(btn);
                var _nextBtn = null;

                do    _nextBtn = this.buttons[++_idx]
                while(_nextBtn && !(_nextBtn.visible()));

                return _nextBtn;
            },
            // returns the previous visible button
            // null if none exists
            previousBtn: function (btn) {
                var _idx = this.buttons.indexOf(btn);
                var _prevBtn = null;

                do    _prevBtn = this.buttons[--_idx]
                while(_prevBtn && !(_prevBtn.visible()));
                
                return _prevBtn;
            },
            isFirst: function(btn) { return btn == this.firstBtn() },
            isLast:  function(btn) { return btn == this.lastBtn() },
            // return first visible button
            firstBtn: function() {
                return this.buttons.find(function(e) {
                    return e.visible();
                });
            },
            // return last visible button
            lastBtn: function() {
                return this.buttons.reverse(false).find(function(e) {
                    return e.visible();
                });
            }
        }
}());


GvaScript.CustomButtons.ActionsBar = Class.create();
Object.extend(GvaScript.CustomButtons.ActionsBar.prototype, {
    initialize: function(container, options) {
        var bcss = CSSPREFIX();
        var defaults = {
            actions: [],
            selectfirst: false
        }
        this.container = $(container);
        this.container.update('');
        this.options = Object.extend(defaults, options || {});
        this.container.addClassName(bcss+'-actionsbar');

        this.options.actions.each(function(action_props) {
            // renders a <button> element and appends it to container
            new GvaScript.CustomButtons.Button(this.container, action_props);
        }, this);
        
        new GvaScript.CustomButtons.ButtonNavigation(this.container, {
            selectFirstBtn: this.options.selectfirst, 
            className: bcss+'-btn-container'
        });
    }
});


// [FILE]
//---------- paginator.js
GvaScript.Paginator = Class.create();

Object.extend(GvaScript.Paginator.prototype, function() {
    var bcss = CSSPREFIX();
    var paginator_css = bcss + '-paginatorbar';
    var pagination_buttons = "<div class='last' title='Dernière page'></div>"
             + "<div class='forward' title='Page suivante'></div>"
             + "<div class='text'></div>"
             + "<div class='back' title='Page précédente'></div>"
             + "<div class='first' title='Première page'></div>";

    function _hasPrevious() {
        return this.index != 1;
    }
    function _hasNext() {
        return this.end_index != this.total;
    }
    function _toggleNavigatorsVisibility() {                           
        if(_hasPrevious.apply(this)) {
            this.back.removeClassName('inactive');
            this.first.removeClassName('inactive');
        }
        else {
            this.back.addClassName('inactive');
            this.first.addClassName('inactive');
        }
        if(_hasNext.apply(this)) {
            this.forward.removeClassName('inactive');
            this.last.removeClassName('inactive');
        }
        else {
            this.forward.addClassName('inactive');
            this.last.addClassName('inactive');
        }
        this.container.show();
    }
    /* Create pagination controls and append them to the placeholder 'PG:frame' */
    function _addPaginationElts() {
        // append the pagination buttons
        this.container.insert(pagination_buttons);
        
        this.first    = this.container.down('.first');
        this.last     = this.container.down('.last');
        this.forward  = this.container.down('.forward');
        this.back     = this.container.down('.back');
        this.textElem = this.container.down('.text');
        
        this.first.observe  ('click', this.getFirstPage.bind(this));
        this.last.observe   ('click', this.getLastPage.bind(this));
        this.back.observe   ('click', this.getPrevPage.bind(this));
        this.forward.observe('click', this.getNextPage.bind(this));
    }
    
    return {        
        initialize: function(url, container, updateFunc, options) {

            var defaults = {
                reset                : 'no',     // if yes, first call sends RESET=yes,
                                                // subsequent calls don't (useful for
                                                // resetting cache upon first request)
                step                 : 20,
                parameters           : $H({}),
                actions              : [],
                lazy                 : false,   // false: load first page with Paginator initialization
                                                // true: donot load automatically, loadContent would 
                                                // have to be called explicity
                targetList           : null,
                timeoutAjax          : 5000,
                errorMsg             : "Problème de connexion. Réessayer et si le problème persiste, contacter un administrateur."
            };
            this.options = Object.extend(defaults, options || {});
            this.options.errorMsg = "<h3 style='color: #183E6C'>" + this.options.errorMsg + "</h3>";

            this.container     = $(container); 
            this.url           = url;
            this.updateFunc    = updateFunc;
            // initialization of flags
            this.index         = 1;
            this.end_index     = 0;
            this.total         = 0;
            this._executing    = false; // loadContent one at a time

            // set the css for the paginator container
            this.container.addClassName(paginator_css);
            // and hide it
            this.container.hide();
            // add the pagination elements (next/prev links + text)
            _addPaginationElts.apply(this);

            // load content by XHR  
            if(!this.options.lazy) this.loadContent();
        },
    
        /* Get the next set of index to 1records from the current url */
        getNextPage: function(btn) {
            if(this._executing == false && _hasNext.apply(this)) {
                this.index += this.options.step;
                this.loadContent();
                return true;
            }
            else 
            return false;
        },
        
        /* Get the prev set of records from the current url */
        getPrevPage: function() {
            if(this._executing == false && _hasPrevious.apply(this)) {
                this.index -= this.options.step;
                this.loadContent();
                return true;
            }
            else 
            return false;
        },

        getLastPage: function() {
            if(this._executing == false && _hasNext.apply(this)) {
                this.index = Math.floor(this.total/this.options.step)*this.options.step+1;
                this.loadContent();
                return true;
            }
            else
            return false;
        },

        getFirstPage: function() {
            if(this._executing == false && _hasPrevious.apply(this)) {
                this.index = 1; 
                this.loadContent();
                return true;
            }
            else
            return false;
        },

        // Core function of the pagination object. 
        // Get records from url that are in the specified range
        loadContent: function() {
            if(this._executing == true) return; // still handling a previous request
            else this._executing = true;

            // Add STEP and INDEX as url parameters
            var url = this.url;
            this.options.parameters.update({
                STEP: this.options.step, 
                INDEX: this.index,
                RESET: this.options.reset
            });
            
            this.container.hide(); // hide 'em. (one click at a time)
            this.options.targetList.update(new Element('div', {'class': bcss+'-loading'}));
            var myAjax = new Ajax.Request(url, { 
                method: 'post',  // POST so we get dispatched to *_PROCESS_FORM
                parameters: this.options.parameters,
                requestTimeout: this.options.timeoutAjax,
                onTimeout: function(req) {
                    this._executing = false;
                    this.options.targetList.update(this.options.errorMsg);
                }.bind(this),
                // on s'attend à avoir du JSON en retour
                onFailure: function(req) {
                    var answer = req.responseJSON;
                    var msg = answer.error.message || this.options.errorMsg;
                    this.options.targetList.update(msg);
                }.bind(this),
                onSuccess: function(req) {
                    this._executing = false;
                    
                    var answer = req.responseJSON;
                    if(answer) {
                        // can be != step if a record's height depend 
                        // on its content
                        // ex: interprete -> records height depend on interprete languages
                        var nb_displayed_records = this.updateFunc(answer);
                        this.total     = answer.total; // total number of records

                        this.end_index = Math.min(this.total, this.index+nb_displayed_records-1); // end index of records on current page
                    
                        this.textElem.innerHTML = (this.total > 0)?  
                            this.index + " &agrave; " + this.end_index + " de " + this.total: '0';
                        _toggleNavigatorsVisibility.apply(this);
                    }
                 }.bind(this)
            });
        }
    }
}());


