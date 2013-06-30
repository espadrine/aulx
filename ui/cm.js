//
//
function AulxUICM(aEditor, aOptions) {

  aOptions = aOptions || {};

  if (!aEditor) {
    console.error("No CodeMirror object or textarea string passed to AulxUI CM");
    return;
  }

  if (typeof aEditor == "string") {
    aEditor = CodeMirror.fromTextArea(aEditor);
  }

  if (!aOptions.noFullscreen) {
    function fullscreen(cm) {
      var wrapper = aEditor.getWrapperElement();
      wrapper.classList.toggle("fullscreen");
      setTimeout(function() {
        aEditor.refresh();
        aEditor.focus();
      }, 400);
    };
    aEditor.addKeyMap({
      F11: fullscreen
    });
    var fullscrenDiv = document.createElement("div");
    fullscrenDiv.setAttribute("class" ,"icon fullscreen");
    fullscrenDiv.setAttribute("title" ,"Toggle Fulscreen Mode");
    fullscrenDiv.onclick = function() {
      fullscreen(aEditor);
    };
    aEditor.getWrapperElement().appendChild(fullscrenDiv);
  }

  if (!aOptions.noToggleTheme) {
    var theme = "default";
    function switchTheme(cm) {
      if (theme == "default") {
        aEditor.setOption("theme", theme = (aOptions.toggleTheme ||
                                            "solarized dark"));
      }
      else {
        aEditor.setOption("theme", theme = "default");
      }
      setTimeout(function() {
        aEditor.refresh();
        aEditor.focus();
      }, 400);
    };
    aEditor.addKeyMap({
      F10: switchTheme
    });
    var changeThemeDiv = document.createElement("div");
    changeThemeDiv.setAttribute("class" ,"icon changeTheme");
    changeThemeDiv.setAttribute("title" ,"Toggle Dark Theme");
    changeThemeDiv.onclick = function() {
      switchTheme(aEditor);
    };
    aEditor.getWrapperElement().appendChild(changeThemeDiv);
  }

  // Inheriting from main AulxUI
  this.editor = aEditor;
  this.__proto__ = new AulxUI(aEditor);

  // The following will fire the autocompletion system on each character!
  this.editor.on('cursorActivity', this._onEditorSelection.bind(this));
  this.editor.on('change', this._onEditorKeyPress.bind(this));

  // Those will become event listeners.
  this._onUp = this._onUp.bind(this);
  this._onDown = this._onDown.bind(this);
  this._onEsc = this._onEsc.bind(this);
  this._onTab = this._onTab.bind(this);
  this._onShiftTab = this._onShiftTab.bind(this);
  this.editor.addKeyMap({
    Up: this._onUp,
    Down: this._onDown,
    Tab: this._onTab,
    'Shift-Tab': this._onShiftTab,
    Esc: this._onEsc,
    fallthrough: "default"
  });

  // Overriding methods derived from AulxUI
  this.__proto__.getCursor = function() {
    return this.editor.getCursor();
  };
  this.__proto__.getValue = function() {
    return this.editor.getValue();
  };
  this.__proto__.isSomethingSelected = function() {
    return this.editor.somethingSelected();
  };
  this.__proto__.getCursorPosition = function() {
    return this.editor.cursorCoords();
  };
};

exports.CM = AulxUICM;
