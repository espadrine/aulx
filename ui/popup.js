/**
 * Author: Girish Sharma <scrapmachines@gmail.com>
 * https://github.com/scrapmac/snippets/blob/master/selectors.js/selectors.js
 */
// IE fix for not having addEventListener and removeEventListener
if (!window.addEventListener) {
  window.addEventListener = function (type, listener, useCapture) {
    attachEvent('on' + type, function() { listener(event) });
  }
}

if (!window.removeEventListener) {
  window.removeEventListener = function (type, listener, useCapture) {
    detachEvent('on' + type, function() { listener(event) });
  }
}

// Maximum number of selector suggestions shown in the panel.
var MAX_VISIBLE_SUGGESTIONS = 15;

/**
 * Autocomplete popup UI implementation.
 *
 * @constructor
 * @param Document aDocument
 *        The document you want the popup attached to.
 * @param Object aOptions
 *        An object consiting any of the following options:
 *        - font {String} The font that is being used in the input box.
 *        - fontSize {Number} The font size that is being used in the input box.
 *        - className {String} The class that you want the popup to have.
 *        - position {String} The preffered position of the popup (above or below).
 *        - maxVisibleRows {Number} Maximum number of visible rows.
 *        - noFocus {Boolean} true if you want the popup to never get focus.
 *        - autoSelect {Boolean} Boolean to allow the first entry of the popup
 *                     panel to be automatically selected when the popup shows.
 *        - onSelect {String} The select event handler for the popup.
 *        - onClick {String} The click event handler for the popup.
 *        - onKeypress {String} The keypress event handler for the popup.
 */
var Popup = function Popup(aDocument, aOptions) {
  this.document = aDocument;

  aOptions = aOptions || {};
  this.autoSelect = aOptions.autoSelect || false;
  this.position = aOptions.position || "above";
  this.noFocus = !!aOptions.noFocus;
  this.maxVisibleRows = aOptions.maxVisibleRows || MAX_VISIBLE_SUGGESTIONS;

  this.onSelect = aOptions.onSelect;
  this.onClick = aOptions.onClick;
  this.onKeypress = aOptions.onKeypress;
  this._onKeypress = this._onKeypress.bind(this);
  this._onClick = this._onClick.bind(this);

  var id = "selectorsPopup";
  // Reuse the existing popup elements.
  this.panel = this.document.getElementById(id);
  if (!this.panel) {
    this.panel = this.document.createElement("div");
    this.panel.setAttribute("id", id);
    this.panel.className = aOptions.className || "autocomplete";
    this.document.documentElement.appendChild(this.panel);
  }
  else {
    this.panel.className = aOptions.className || "autocomplete"
  }

  if (this.onSelect) {
    this.panel.addEventListener("select", this.onSelect, false);
  }

  this.panel.addEventListener("keydown", this._onKeypress, false);
  this.panel.addEventListener("mouseup", this._onClick, false);

  // Detecting webkit due to https://bugs.webkit.org/show_bug.cgi?id=92029 :(
  this.isWebkit = !!navigator.userAgent.match(/webkit/ig);

  if (this.isWebkit) {
    this.document.addEventListener("keydown", function(event) {
      if (!this.isOpen()) {
        return;
      }
      if (event.keyCode == 38) {
        this.selectPreviousItem();
      }
      else if (event.keyCode == 40) {
        this.selectNextItem();
      }
      else {
        return;
      }
      this.focus();
      event.preventDefault();
      event.stopPropagation();
    }.bind(this));
  }

  // creating the CSS
  var css = document.getElementById("selectorPopupCSS");
  if (!css) {
    var css = document.createElement('style');
    css.id = "selectorPopupCSS";
    css.type = 'text/css';
    document.querySelector("head").appendChild(css);
  }

  // A trick to write formatted CSS without any inturruption.
  // Using /*! to prevent this comment from getting removed after minifying.
  var styles = function() {/*!
#selectorsPopup {
  background: white;
  box-shadow: 0 0 2px 0 #666;
  border: 2px solid #404040;
  position: absolute;
  z-index: 99999;
  overflow: hidden;
  display: none;
  min-width: 150px;
}
#selectorsPopup pre {
  margin: 0 !important;
}
#selectorsPopup label {
  color: #666;
  display: inline-block;
  display: flex;
  width: calc(100% - 10px);
  padding: 0px 4px;
  border: 1px solid transparent;
  font-family: %FONT%;
  font-size: %FONTSIZE%px;
}
#selectorsPopup label > b {
  color: #000;
  font-weight: normal;
  font-family: inherit;
  font-size: inherit;
}
#selectorsPopup label.pre:before {
  color: #000;
  content: attr(data-pre);
  display: inline-block;
}
#selectorsPopup label.count:after {
  color: #000;
  content: attr(data-count);
  float: right;
  flex: 1 1 auto;
  text-align: right;
}
#selectorsPopup input {
  opacity: 0;
  margin: -20px 0 0 0 !important;
  float: right;
  pointer-events: none;
}
#selectorsPopup label:hover:active,
#selectorsPopup input:checked + pre label {
  background: linear-gradient(#a2c0e3, #8caad5);
}
#selectorsPopup input:checked:focus + pre label,
#selectorsPopup label:hover {
  border: 1px solid #224;
}
#selectorsPopup input:checked:focus + pre label,
#selectorsPopup input:checked:focus + pre label.pre:before,
#selectorsPopup input:checked:focus + pre label.count:after {
  color: #000;
}
*/}.toString().split("/*")[1].split("*/")[0].slice(1)
   .replace("%FONT%", aOptions.font || "")
   .replace("%FONTSIZE%", aOptions.fontSize || "14");

  if (css.styleSheet) {
    css.styleSheet.cssText = styles;
  }
  else {
    css.appendChild(document.createTextNode(styles));
  }
}

Popup.prototype = {
  document: null,
  panel: null,

  // Event handlers.
  onSelect: null,
  onClick: null,
  onKeypress: null,

  _open: false,
  _cachedString: "",
  values: [],
  selectedIndex: -1,
  height: null,

  /**
   * Open the autocomplete popup panel. If the space is not enough, the popup
   * will open in the opposite direction.
   *
   * @param x {Number} The x coordinate of the top left point of the input box.
   * @param y {Number} The y coordinate of the top left point of the input box.
   */
  openPopup: function(x, y) {
    this.panel.style.display = "block";
    // If position is above, the (x, y) point will be the bottom left point of
    // the popup, unless there is not enough space to show the popup above.
    var height = 0;
    if (this.values.length) {
      var style = this.panel.getBoundingClientRect();
      height = style.height;
    }
    var scroll = scrollY || document.documentElement.scrollTop;
    if ((this.position == "above" && y - height - scroll < 0) ||
        (this.position == "below" && y + height + 20 + scroll > innerHeight)) {
      this.panel.style.top = (y + 20  + scroll) +"px";
      this.inverted = (this.position == "above");
    }
    else {
      this.panel.style.top = (y - height + scroll) +"px";
      this.inverted = (this.position == "below");
    }
    if (this.inverted) {
      this.reversePopup();
    }
    this.panel.style.left = (x - 3) +"px";
    this._open = true;

    if (this.autoSelect) {
      this.selectFirstItem();
    }
  },

  /**
   * Hide the autocomplete popup panel.
   */
  hidePopup: function() {
    this._open = false;
    this.panel.style.display = "none";
  },

  /**
   * Check if the autocomplete popup is open.
   */
  isOpen: function() {
    return this._open;
  },

  /**
   * Destroy the object instance.
   */
  destroy: function() {
    this.hidePopup();
    this.clearItems();

    if (this.onSelect) {
      this.panel.removeEventListener("select", this.onSelect, false);
    }

    this.panel.removeEventListener("keydown", this._onKeypress, false);
    this.panel.removeEventListener("mouseup", this._onClick, false);

    this.panel.parentNode.removeChild(this.panel);
    this.document = null;
    this.panel = null;
  },

  /**
   * Reverses the items in the popup
   */
  reversePopup: function() {
    var node = this.panel,
        parent = node.parentNode,
        next = node.nextSibling,
        frag = node.ownerDocument.createDocumentFragment();
    parent.removeChild(node);
    while(node.lastChild) {
      frag.appendChild(node.lastChild.previousSibling);
      frag.appendChild(node.lastChild);
    }
    node.appendChild(frag);
    parent.insertBefore(node, next);
  },

  /**
   * Gets the autocomplete items array.
   *
   * @param aIndex {Number} The index of the item what is wanted.
   *
   * @return {Object} The autocomplete item at index aIndex.
   */
  getItemAtIndex: function(aIndex) {
    return this.values[this.inverted ? this.itemCount() - aIndex - 1 : aIndex];
  },

  /**
   * Get the autocomplete items array.
   *
   * @return {Array} The array of autocomplete items.
   */
  getItems: function() {
    return this.values;
  },

  /**
   * Sets the autocomplete items list, in one go.
   *
   * @param {Array} aItems
   *        The list of items you want displayed in the popup list.
   */
  setItems: function(aItems) {
    this.clearItems();
    aItems.splice(this.maxVisibleRows);
    aItems.forEach(this.appendItem, this);

    this._flushItems();

    if (this.isOpen() && this.autoSelect) {
      this.selectFirstItem();
    }
  },

  /**
   * Selects the first item of the richlistbox. Note that first item here is the
   * item closes to the input element, which means that 0th index if position is
   * below, and last index if position is above.
   */
  selectFirstItem: function() {
    if (this.position.indexOf("above") > -1 ^ this.inverted) {
      this.panel.childNodes[(this.selectedIndex = this.values.length - 1)*2].checked = true;
    }
    else {
      this.panel.childNodes[this.selectedIndex = 0].checked = true;
    }
  },

  /**
   * Private method to handle keypress on the popup, update the selectedIndex
   * and then call the provided onKeypress method.
   *
   * @private
   */
  _onKeypress: function(aEvent) {
    for (var i = 0; i < this.values.length; i++) {
      if (this.panel.childNodes[i*2].checked) {
        this.selectedIndex = i;
        break;
      }
    }
    if (this.onKeypress) {
      this.onKeypress(aEvent);
    }
  },

  /**
   * Private method to handle click on the popup, update the selectedIndex and
   * then call the provided onKeypress method.
   *
   * @private
   */
  _onClick: function(aEvent) {
    for (var i = 0; i < this.values.length; i++) {
      if (this.panel.childNodes[i*2 + 1].firstChild == aEvent.target) {
        this.selectedIndex = i;
        break;
      }
    }
    if (this.onClick) {
      this.onClick(aEvent);
    }
  },

  /**
   * Clears all the items from the autocomplete list.
   */
  clearItems: function() {
    this.panel.innerHTML = "";
    this.selectedIndex = -1;
    this._cachedString = "";
    this.values = [];
  },

  /**
   * Returns the object associated with the selected item. Note that this does
   * not return the DOM element of the selected item, but the object in the form
   * of {label, preLabe, count}.
   *
   * @return {Object} The object corresponding to the selected item.
   */
  getSelectedItem: function() {
    return this.values[this.inverted
                       ? this.itemCount() - this.selectedIndex - 1
                       : this.selectedIndex];
  },

  /**
   * Appends an item into the autocomplete list.
   *
   * @param {Object} aItem
   *        The item you want appended to the list.
   *        The item object can have the following properties:
   *        - label {String} Property which is used as the displayed value.
   *        - preLabel {String} [Optional] The String that will be displayed
   *                   before the label indicating that this is the already
   *                   present text in the input box, and label is the text
   *                   that will be auto completed. When this property is
   *                   present, |preLabel.length| starting characters will be
   *                   removed from label.
   *        - count {Number} [Optional] The number to represent the count of
   *                autocompleted label.
   */
  appendItem: function(aItem) {
    var str = this._cachedString;
    var label = aItem.label || aItem.display,
        pre = aItem.preLabel || aItem.prefix;
    str += "<input type='radio' name='autocomplete-radios' value='" + label +
           "'><pre><label";
    var cls = "", fuzzy = false;
    if (pre && label.indexOf(pre) == 0) {
      str += " data-pre='" + pre + "'";
      cls += "pre";
    }
    else if (pre) {
      fuzzy = true;
    }
    if (aItem.count && aItem.count > 1) {
      str += " data-count='" + aItem.count + "'";
      cls += " count";
    }
    if (cls) {
      str += " class='" + cls + "'";
    }
    str += " for='" + label + "'>" + (fuzzy ?
           (h = {}, label.replace(new RegExp("[" + pre + "]", "g"), function(m) {
             return !h[m] ? (h[m] = 1, "<b>" + m + "</b>") : m;
           })) : label.slice((pre || "").length)) + "</label></pre>";
    this._cachedString = str;
    this.values.push(aItem);
  },

  /**
   * Method to flush the generated string by the appendItems method into the
   * panel's inner HTML.
   *
   * @private
   */
  _flushItems: function() {
    this.panel.innerHTML = this._cachedString;
  },

  /**
   * Finds the label element that belongs to an item.
   *
   * @private
   *
   * @param {Object} aItem
   *        The object you want found in the list.
   *
   * @return {nsIDOMNode|null}
   *         The nsIDOMNode that belongs to the given item object. This node is
   *         the label element.
   */
  _findListItem: function(aItem) {
    var toReturn = null;
    this.values.some(function (item, i) {
      var found = true;
      for (var a in item) {
        if (item[a] != aItem[a]) {
          found = false;
        }
      }
      if (found) {
        toReturn = this.panel.childNodes[i*2];
        return true
      }
    });
    return toReturn;
  },

  /**
   * Removes an item from the popup list.
   *
   * @param {Object} aItem
   *        The item you want removed.
   */
  removeItem: function(aItem) {
    var item = this._findListItem(aItem);
    item && this.panel.removeChild(item.nextSibling) && this.panel.removeChild(item);
  },

  /**
   * Returns the number of items in the popup.
   *
   * @returns {Number} The number of items in the popup
   */
  itemCount: function() {
    return this.values.length;
  },

  /**
   * Selects the next item in the list.
   *
   * @return {Object} The newly selected item object.
   */
  selectNextItem: function() {
    if (this.selectedIndex < this.itemCount() - 1) {
      this.selectedIndex++;
    }
    else {
      this.selectedIndex = 0;
    }
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    return this.getSelectedItem();
  },

  /**
   * Selects the previous item in the list.
   *
   * @return {Object} The newly selected item object.
   */
  selectPreviousItem: function() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    }
    else {
      this.selectedIndex = this.itemCount() - 1;
    }
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    return this.getSelectedItem();
  },

  /**
   * Gets the next item to the selected item in the list.
   *
   * @return {Object} The next item object.
   */
  getNextItem: function() {
    return this.getItemAtIndex(this.selectedIndex + 1);
  },

  /**
   * Gets the previous item to the selected item in the list.
   *
   * @return {Object} The previous item object.
   */
  getPreviousItem: function() {
    return this.getItemAtIndex(this.selectedIndex - 1);
  },

  /**
   * Focuses the selected item in the popup.
   */
  focus: function() {
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    !this.noFocus && this.panel.childNodes[this.selectedIndex*2].focus();
  },
};

exports.Popup = Popup;
