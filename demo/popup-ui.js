(function(global, undefined) {

// Create a new popover. It gets a "div.popover" class.
// It starts invisible (display: none).
function createPopover(aDocument, aCssClass) {
  var document = aDocument;
  var cssClass = aCssClass;
  var popover = document.createElement("ul");
  popover.classList.add("CodeMirror-hints");
  if (cssClass) {
    popover.classList.add(cssClass);
  }
  popover.style.position = "absolute";
  popover.style.display = "none";
  popover.scrollTop = 0;
  document.body.appendChild(popover);
  return popover;
}


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

// Autocompletion object.
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
function Autocompletion(aEditor, aOptions) {
  aOptions = aOptions || {};
  this.numVisibleCompletions = aOptions.numVisibleCompletions ||
      NUM_VISIBLE_COMPLETIONS;
  this.editor = aEditor;
  this.document = global.document;

  // Initiate Aulx in JS mode.
  this.aulxJS = new Aulx.JS({
    global: global,
    parse: parseCont,
    parserContinuation: true
  });
  // Create the popover.
  this.popover = createPopover(this.document, aOptions.cssClass);
  // Track clicking on options.
  this.popover.addEventListener('click', this._clickOnOption.bind(this), true);

  // The following will fire the autocompletion system on each character!
  this.editor.on('cursorActivity', this._onEditorSelection.bind(this));
  this.editor.on('change', this._onEditorKeyPress.bind(this));

  // Those will become event listeners.
  this.stop = this.stop.bind(this);
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
}

Autocompletion.prototype = {

  numVisibleCompletions: NUM_VISIBLE_COMPLETIONS,

  // The following are useful DOM elements.
  editor: null,
  document: null,
  popover: null,

  // When the autocompletion is triggered, it is "on",
  // and the index gives us the selected candidate.
  _on: false,
  _index: 0,
  // When we are going through candidates one by one, we are cycling.
  // Then, '_start' is the offset to when we start autocompleting candidates,
  // and '_end' marks the end offset of the inserted candidate.
  _cycling: false,
  _start: {line:0, ch:0},
  _end: {line:0, ch:0},
  // While in the process of autocompleting, we are inserting text (this
  // variable is used to avoid race conditions.
  _insertingText: 0,
  _completion: null,
  _line: 0,

  _delayedPopup: null,

  runCompleters: function AC_runCompleters() {
    this._completion = this.aulxJS.complete(this.editor.getValue(),
                                            this.editor.getCursor());
  },

  // Show the completions that are asked for.
  // This function assumes there exists a
  // popover (see function createPopover()).
  displayCompletion: function AC_displayCompletion() {
    if (this._completion == null) {
      this.runCompleters();
    }
    var completions = this._completion.candidates;

    // Show the popover.
    var ed = this.editor;
    // We don't complete on a selection of text.
    // We don't show the completion popover without any completion.
    if (ed.somethingSelected() || completions.length < 1) {
      this.hideCompletion();
      return;
    }

    // The popover is a <ul>.
    var html = "";
    for (var i = 0; i < completions.length; i++) {
      // The first option gets selected by default.
      html += '<li class="CodeMirror-hint' +
        (i === this._index ? ' CodeMirror-hint-active': '') + '" ' +
        'data-hint-id="' + i + '">' +
        completions[i].display + '</li>';
    }
    this.popover.innerHTML = html;

    var pos = ed.cursorCoords();
    if (!this._cycling) {
      this.popover.style.left = pos.left + "px";
    }
    this.popover.style.top = pos.bottom + "px";
    // If we're at the edge of the screen,
    // then we want the menu to appear on the left of the cursor.
    var winW = window.innerWidth || Math.max(this.document.body.offsetWidth,
        this.document.documentElement.offsetWidth);
    if(winW - pos.left < this.popover.clientWidth)
      this.popover.style.left = (pos.left - this.popover.clientWidth) + "px";

    // Reveal.
    this.popover.style.display = 'block';
    this.popover.scrollTop = 0;
    this._on = true;
  },

  _selectIndex: function AC__selectIndex() {
    for (var i = 0; i < this.popover.children.length; i++) {
      this.popover.children[i].className = 'CodeMirror-hint' +
        (this._index === i ?  ' CodeMirror-hint-active': '');
    }
    var node = this.popover.children[this._index];
    if (node.offsetTop < this.popover.scrollTop) {
      this.popover.scrollTop = node.offsetTop - 3;
    } else if (node.offsetTop + node.offsetHeight > this.popover.scrollTop +
        this.popover.clientHeight) {
      this.popover.scrollTop = node.offsetTop + node.offsetHeight -
        this.popover.clientHeight + 3;
    }
  },

  // Specific autocompletion-only keys.
  _onUp: function AC__onUp(editor) {
    // ↑ key.
    if (this._on) {
      this.cycle(-1);
    } else {
      CodeMirror.commands.goLineUp(editor);
    }
  },
  _onDown: function AC__onDown(editor) {
    // ↓ key.
    if (this._on) {
      if (!this._cycling) {
        this.cycle(2);
      } else {
        this.cycle();
      }
    } else {
      CodeMirror.commands.goLineDown(editor);
    }
  },
  _onEsc: function AC__onEsc(editor) {
    // ESC key.
    if (this._on) {
      this.stop();
      if (this._cycling) {
        this.editor.replaceRange("", this._start, this._end);
      }
    }
  },
  _onTab: function AC__onTab(editor) {
    // Tab key.
    if (editor.somethingSelected()) {
      CodeMirror.commands.defaultTab(editor);
    } else {
      this.cycle();
    }
  },
  _onShiftTab: function AC__onShiftTab(editor) {
    // Shift+Tab key.
    if (editor.somethingSelected()) {
      CodeMirror.commands.indentAuto(editor);
    } else {
      this.cycle(-1);
    }
  },

  _onEditorKeyPress: function AC__onEditorKeyPress(aEvent) {
    if (!this._insertingText) {
      this.stop();
      clearTimeout(this._delayedPopup);
      this._delayedPopup = setTimeout(this.displayCompletion.bind(this),
          DELAYED_POPUP);
    } else {
      this._insertingText = false;
    }
  },

  _onEditorSelection: function AC__onEditorSelection(aEditor) {
    // If the line changed, the static analysis is worth updating.
    var lineno = aEditor.getCursor().line;
    if (this._line !== lineno) {
      this.aulxJS.fireStaticAnalysis(this.editor.getValue(),  
                                     this.editor.getCursor());
      this._line = lineno;
      this.stop();
    }
  },

  _clickOnOption: function AC__clickOnOption(e) {
    var t = e.target || e.srcElement;
    var hintId = +t.getAttribute('data-hint-id');
    if (hintId !== hintId) { return; }
    if (this._cycling) {
      this.cycle(hintId - this._index);
    } else {
      this.cycle(hintId + 1);
    }
    this.editor.focus();
  },

  // Make the completion popup invisible.
  hideCompletion: function AC_hideCompletion() {
    this.popover.style.display = "none";
    this._completion = null;
    this._on = false;
    this._index = 0;
  },

  // Cycle through autocompletion entries.
  //
  // aCount: The number of completions to advance to / go back to.
  cycle: function AC_cycle(aCount) {
    if (!aCount) { aCount = 1; }
    if (this._cycling) {
      this._index += aCount;
      if (this._index >= this._completion.candidates.length) {
        // Go back to the start.
        this._index = 0;
      } else if (this._index < 0) {
        // Go back to the end.
        this._index = this._completion.candidates.length - 1;
      }
      // Update the UI.
      this._selectIndex();

      // Insert the corresponding entry.
      this.insert(this._completion.candidates[this._index].display,
                  this._completion.candidates[this._index].prefix);

    } else {  // We are not yet cycling.
      // FIXME: do we need this?
      // Making a new spot in the undo stack allows the user
      // to undo the autocompletion.

      this.runCompleters();
      if (aCount == 0) {
        this._index = 0;
      } else if (aCount > 0) {
        // We can start from the beginning.
        this._index = aCount - 1;
      } else if (aCount < 0) {
        // We can also start at the end.
        this._index = this._completion.candidates.length + aCount;
      }

      // Only do something if we have a completion to work with.
      if (this._completion.candidates.length > 0) {
        // If there is a choice to make, show the choice.
        if (this._completion.candidates.length > 1) {
          this.displayCompletion();
          this._cycling = true;
        }

        // Now, show the first entry.
        // We only do that now, because the popover must appear at the position
        // that the cursor initially had.
        this._start = this.editor.getCursor();
        this._end = {line: this._start.line, ch: this._start.ch};
        this.insert(this._completion.candidates[this._index].display,
                    this._completion.candidates[this._index].prefix);

        // If the popup was already displayed, hide it.
        if (this._completion.candidates.length <= 1) {
          this.hideCompletion();
        }
      }
    }
  },

  // Insert a possible autocompletion in the editor.
  //
  // inserted: The text to insert inline.
  insert: function AC_insert(display, prefix) {
    this._insertingText = true;
    var start = {   // FIXME: what if the prefix starts on the line before?
      line: this._start.line,
      ch: this._start.ch - prefix.length
    };
    this.editor.replaceRange(display, start, this._end);

    var postfix = display.slice(prefix.length);
    var numLines = 0, isol, i = 0;
    for (; i < postfix.length; i++) {
      if (postfix.charCodeAt(i) === 10) {
        // Newline
        numLines++;
        isol = i + 1;   // index of start of line.
      }
    }
    this._end.line = this._start.line + numLines;
    if (numLines > 0) {
      this._end.ch = this._start + postfix.length - isol;
    } else {
      this._end.ch = this._start.ch + postfix.length;
    }
  },

  // Make the autocompletion popover go away, remove useless data.
  //
  // Returns a boolean: Whether the stop operation was successful.
  stop: function AC_stop() {
    // If the autocompletion system is going through an operation,
    // we cannot stop it.
    if (this._insertingText) {
      return false;
    }
    this.hideCompletion();
    this._cycling = false;
    return true;
  },

};
global.Autocompletion = Autocompletion;


}(this));
