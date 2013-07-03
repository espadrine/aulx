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
    var switchTheme = function(cm) {
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
        this._charWidth = this.getCursorPosition().left/this.getCursor().ch;
      }.bind(this), 600);
    }.bind(this);
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
  this.editor.on('cursorActivity', this._onEditorSelection);
  this.editor.on('change', this._onEditorKeyPress);

  // Those will become event listeners.
  this.editor.addKeyMap({
    Left: this._onLeft,
    Right: this._onRight,
    Tab: this._onTab,
    'Shift-Tab': this._onShiftTab,
    Esc: this._onEsc,
    fallthrough: "default"
  });

  // Overriding methods derived from AulxUI
  this.__proto__.getCursor = function() {
    return this.editor.getCursor();
  };
  this.__proto__.getCharWidth = function() {
    if (!this._charWidth) {
      this._charWidth = this.getCursorPosition().left/this.getCursor().ch;
    }
    return this._charWidth;
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
  this.__proto__.doDefaultAction = function(action) {
    switch(action) {
      case "Up":
      case "Down":
        CodeMirror.commands["goLine" + action](this.editor);
        break;
      case "Left":
      case "Right":
        CodeMirror.commands["goChar" + action](this.editor);
        break;
      case "Tab":
        CodeMirror.commands.defaultTab(this.editor);
        break;
      case "ShiftTab":
        CodeMirror.commands.indentAuto(this.editor);
    }
  };
  this.__proto__.replaceRange = function(aText, aStart, aEnd) {
    this.editor.replaceRange(aText, aStart, aEnd);
  };
};

exports.CM = AulxUICM;
