// Wrapper around the parser (which is located inside a worker).
// We don't actually use options,
// but we know to set loc to true inside the worker.
function parseCont(source, options, cb) {
  parserWorker.onmessage = function parserWorkerMessageListener(event) {
    cb(event.data);
  };
  parserWorker.postMessage(source);
}

var NUM_VISIBLE_COMPLETIONS = 10;
var DELAYED_POPUP = 0;

// AulxUI object.
// This constructor creates the necessary DOM popup.
//
// Parameters:
// - aEditor: The Source Editor instance to target.
// - aOptions: Properties for tuning certain defaults:
//   - numVisibleCompletions (defaults to NUM_VISIBLE_COMPLETIONS): number
//     of visible completions with respect to all possible completions.
//   - cssClass (defaults to "autocomplete"): CSS class used to style the
//     autocompletion popup.
//
//  See NUM_VISIBLE_COMPLETIONS
function AulxUI(aEditor, aOptions) {
  aOptions = aOptions || {};
  this.editor = aEditor;
  this.document = global.document;

  // Initiate Aulx in JS mode.
  if (parserWorker) {
    this.aulxJS = new Aulx.JS({
      global: global,
      parse: parseCont,
      parserContinuation: true
    });
  }
  else {
    this.aulxJS = new Aulx.JS({
      global: global,
      parse: esprima.parse
    });
  }
  // Create the popup.
  var options = {
    fontSize: 14,
    autoSelect: true,
    noFocus: true,
    position: "below",
    maxVisibleRows: aOptions.numVisibleCompletions || NUM_VISIBLE_COMPLETIONS,
    onClick: this._onListBoxKeypress,
    onSelect: this._onListBoxKeypress
  };
  this.popup = new Popup(this.document, options);
}

AulxUI.prototype = {

  // The following are useful DOM elements.
  editor: null,
  document: null,
  popup: null,

  // While in the process of autocompleting, we are inserting text (this
  // variable is used to avoid race conditions.
  _insertingText: 0,
  _completion: null,
  _line: 0,

  _delayedPopup: null,

  runCompleters: function AUI_runCompleters() {
    this._completion = this.aulxJS.complete(this.getValue(), this.getCursor());
  },

  // Show the completions that are asked for.
  // This function assumes there exists a
  // popup (see function createpopup()).
  displayCompletion: function AUI_displayCompletion() {
    if (this._completion == null) {
      this.runCompleters();
    }
    var completions = this._completion.candidates;

    // Show the popup.
    // We don't complete on a selection of text.
    // We don't show the completion popup without any completion.
    if (this.isSomethingSelected() || completions.length < 1) {
      this.hideCompletion();
      return;
    }

    // Set the items in the popup
    this.popup.setItems(completions);

    // Get the coordinates to open the popup at
    var pos = this.getCursorPosition();
    this.popup.openPopup(pos.left, pos.top);
  },

  // Specific autocompletion-only keys.
  _onUp: function AUI__onUp() {
    // ↑ key.
    if (this.popup.isOpen()) {
      this.popup.selectPreviousItem();
    }
    else {
      this.doDefaultAction("Up");
    }
  },
  _onDown: function AUI__onDown() {
    // ↓ key.
    if (this.popup.isOpen()) {
      this.popup.selectNextItem();
    }
    else {
      this.doDefaultAction("Down");
    }
  },
  _onEsc: function AUI__onEsc() {
    // ESC key.
    if (this.popup.isOpen()) {
      this.hideCompletion();
      this.removeCompletion();
    }
    else {
      this.doDefaultAction("Esc");
    }
  },
  _onTab: function AUI__onTab() {
    // Tab key.
    if (!this.isSomethingSelected() && this.popup.isOpen()) {
      this.popup.inverted ? this.popup.selectPreviousItem()
                          : this.popup.selectNextItem();
    }
    else {
      this.doDefaultAction("Tab");
    }
  },
  _onShiftTab: function AUI__onShiftTab() {
    // Shift+Tab key.
    if (!this.isSomethingSelected() && this.popup.isOpen()) {
      this.popup.inverted ? this.popup.selectNextItem()
                          : this.popup.selectPreviousItem();
    }
    else {
      this.doDefaultAction("ShiftTab");
    }
  },

  _onEditorKeyPress: function AUI__onEditorKeyPress(aEvent) {
    if (!this._insertingText) {
      this.hideCompletion();
      clearTimeout(this._delayedPopup);
      this._delayedPopup = setTimeout(this.displayCompletion.bind(this),
                                      DELAYED_POPUP);
    } else {
      this._insertingText = false;
    }
  },

  _onEditorSelection: function AUI__onEditorSelection() {
    // If the line changed, the static analysis is worth updating.
    var lineno = this.getCursor().line;
    if (this._line !== lineno) {
      this.aulxJS.fireStaticAnalysis(this.getValue(), this.getCursor());
      this._line = lineno;
      this.hideCompletion();
    }
  },

  _clickOnOption: function AUI__clickOnOption(e) {
    switch(e.keyCode || e.button) {
      case 14: // ENTER
      case 13: // RETURN
      case 0: // left mouse button
        e.stopPropagation();
        e.preventDefault();
        var item = this.popup.getSelectedItem();
        this.insert(item.display.slice(item.prefix.length));
        this.editor.focus();
    }
  },

  // Make the completion popup invisible.
  hideCompletion: function AUI_hideCompletion() {
    this.popup.hidePopup();
    this._completion = null;
  },

  // Insert a possible autocompletion in the editor.
  //
  // aText: The text to insert inline.
  insert: function AUI_insert(aText) {return;
    this._insertingText = true;
    this.editor.replaceRange(aText, this._start, this._end);
    var numLines = 0, isol, i = 0;
    for (; i < aText.length; i++) {
      if (aText.charCodeAt(i) === 10) {
        // Newline
        numLines++;
        isol = i + 1;   // index of start of line.
      }
    }
    this._end.line = this._start.line + numLines;
    if (numLines > 0) {
      this._end.ch = this._start + aText.length - isol;
    } else {
      this._end.ch = this._start.ch + aText.length;
    }
  },
};

exports.AulxUI = AulxUI;
