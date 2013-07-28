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
var EDITOR_MODES = {
  JAVASCRIPT: 0,
  CSS: 1,
  HTML: 2,
};

// AulxUI object.
// This constructor handles the popup and creates the necessary methods so that
// other objects can inherit this object to create text editor specific
// implementations.
//
// Parameters:
// - aEditor: The Source Editor instance to target.
//   It should have a `.focus()` method.
// - aOptions: Properties for tuning certain defaults:
//   - numVisibleCompletions (defaults to NUM_VISIBLE_COMPLETIONS): number
//     of visible completions with respect to all possible completions.
//   - cssClass (defaults to "autocomplete"): CSS class used to style the
//     autocompletion popup.
//   - mode (defaults to EDITOR_MODES.JAVASCRIPT): The mode (or language) of the
//     editor.
//
//  See NUM_VISIBLE_COMPLETIONS
function AulxUI(aEditor, aOptions) {
  aOptions = aOptions || {};
  this.editor = aEditor;
  this.document = global.document;

  this.mode = aOptions.mode;
  if (this.mode == EDITOR_MODES.JAVASCRIPT) {
    // Initiate Aulx in JS mode.
    if (parserWorker) {
      this.aulxJS = new Aulx.JS({
        global: global,
        parse: parseCont,
        parserContinuation: true
      });
    }
    else {
      // If parser is not available somehow, fallback to sync parsing version of
      // Aulx.JS()
      this.aulxJS = new Aulx.JS({
        global: global,
        parse: esprima.parse
      });
    }
  }
  else if (this.mode == EDITOR_MODES.CSS) {
    // TODO: Initiate Aulx CSS object.
  }

  // Bind!
  this._onUp = this._onUp.bind(this);
  this._onDown = this._onDown.bind(this);
  this._onLeft = this._onLeft.bind(this);
  this._onRight = this._onRight.bind(this);
  this._onEsc = this._onEsc.bind(this);
  this._onTab = this._onTab.bind(this);
  this._onShiftTab = this._onShiftTab.bind(this);
  this._onEditorKeyPress = this._onEditorKeyPress.bind(this);
  this._onEditorSelection = this._onEditorSelection.bind(this);
  // Create the popup.
  var options = {
    fontSize: 14,
    autoSelect: true,
    noFocus: true,
    position: "below",
    className: aOptions.cssClass,
    maxVisibleRows: aOptions.numVisibleCompletions || NUM_VISIBLE_COMPLETIONS,
    onClick: this._completionClick.bind(this),
    onSelect: this._completionClick.bind(this)
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
  // This lets us know if we should cycle on tab press or only insert the first
  // time.
  _insertedOnce: false,

  _completion: null,
  _line: 0,
  _start: null,
  _end: null,

  _delayedPopup: null,

  runCompleters: function AUI_runCompleters() {
    this._completion = this.aulxJS.complete(this.getValue(), this.getCursor());
  },

  // Show the completions that are asked for.
  displayCompletion: function AUI_displayCompletion() {
    if (this._completion == null) {
      this.runCompleters();
    }
    var completions = this._completion.candidates;

    // Show the popup.
    // We don't complete on a selection of text.
    // We don't show the completion popup without any completion.
    if (this.isSomethingSelected() || completions.length < 1) {
      this.hidePopup();
      return;
    }

    // Set the items in the popup
    this.popup.setItems(completions);

    // Get the coordinates to open the popup at
    var pos = this.getCursorPosition();
    pos.left -= (completions[0].prefix.length * (this.getCharWidth()|0) + 4);
    this.popup.openPopup(pos.left, pos.top);
  },

  // Specific autocompletion-only keys.
  _onUp: function AUI__onUp() {
    // ↑ key.
    if (this.popup.isOpen()) {
      this.popup.selectPreviousItem();
      this._UpDown = true;
      this._insertedOnce = false;
    }
    else {
      this.doDefaultAction("Up");
    }
  },
  _onDown: function AUI__onDown() {
    // ↓ key.
    if (this.popup.isOpen()) {
      this.popup.selectNextItem();
      this._UpDown = true;
      this._insertedOnce = false;
    }
    else {
      this.doDefaultAction("Down");
    }
  },
  _onLeft: function AUI__onLeft() {
    // ← key.
    this.hidePopup();
    this.doDefaultAction("Left");
  },
  _onRight: function AUI__onRight() {
    // → key.
    this.hidePopup();
    this.doDefaultAction("Right");
  },
  _onEsc: function AUI__onEsc() {
    // ESC key.
    if (this.popup.isOpen()) {
      this.removeCompletion();
      this.hidePopup();
    }
    else {
      this.doDefaultAction("Esc");
    }
  },
  _onTab: function AUI__onTab() {
    // Tab key.
    if (!this._insertedOnce && this.popup.isOpen()) {
      this._UpDown = false;
      this.insert(this.popup.getSelectedItem());
      if (this.popup.itemCount() == 1) {
        this.hidePopup();
      }
      return;
    }
    if (!this.isSomethingSelected() && this.popup.isOpen()) {
      this._UpDown = false;
      this.popup.inverted ? this.popup.selectPreviousItem()
                          : this.popup.selectNextItem();
      this.insert(this.popup.getSelectedItem());
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
      this.insert(this.popup.getSelectedItem());
      if (this.popup.itemCount() == 1) {
        this.hidePopup();
      }
    }
    else {
      this.doDefaultAction("ShiftTab");
    }
  },

  _onEditorKeyPress: function AUI__onEditorKeyPress(aEvent) {
    if (!this._insertingText) {
      this.hidePopup();
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
      this.hidePopup();
    }
  },

  _completionClick: function AUI__completionClick(e) {
    switch(e.keyCode || e.button) {
      case 14: // ENTER
      case 13: // RETURN
      case 0: // left mouse button
        e.stopPropagation();
        e.preventDefault();
        this.insert(this.popup.getSelectedItem());
        this.hidePopup();
        this.editor.focus();
    }
  },

  // Make the completion popup invisible.
  hidePopup: function AUI_hidePopup() {
    this.popup.hidePopup();
    this._completion = null;
    this._insertedOnce = false;
    this._start = null;
    this._UpDown = false;
  },

  // Insert a possible autocompletion in the editor.
  //
  // aItem: The completion item to insert inline.
  // Should be in the following format:
  //   {
  //     display: // the full string that is being inserted
  //     prefix:  // the initial part of text which will be replaced with
  //              // the display string.
  //   }
  insert: function AUI_insert(aItem) {
    this._insertingText = true;
    if (!this._insertedOnce && !this._start) {
      var temp = this.getCursor();
      this._start = {
        line: temp.line,
        ch: Math.max(temp.ch - aItem.prefix.length, 0)
      };
      this._end = {line: temp.line, ch: temp.ch};
    }
    this.replaceRange(aItem.display, this._start, this._end);
    this._insertedOnce = true && !this._UpDown;
    var numLines = 0, isol, i = 0;
    for (; i < aItem.display.length; i++) {
      if (aItem.display.charCodeAt(i) === 10) {
        // Newline
        numLines++;
        isol = i + 1;   // index of start of line.
      }
    }
    this._end.line = this._start.line + numLines;
    if (numLines > 0) {
      this._end.ch = this._start.ch + aItem.display.length - isol;
    }
    else {
      this._end.ch = this._start.ch + aItem.display.length;
    }
  },

  // Remove the inserted completion object and stores it to originally placed
  // text.
  removeCompletion: function AUI_removeCompletion() {
    if (!this._insertedOnce) {
      return;
    }
    var item = this.popup.getSelectedItem();
    this.insert({display: item.prefix, prefix: item.prefix});
    this._insertedOnce = false;
  }
};

exports.AulxUI = AulxUI;
