//
// The possible completions to a ':' with added score to give certain values
// some preference.
//
var PSEUDO_SUGGESTIONS = [
  [":active", 1],
  [":hover", 1],
  [":focus", 1],
  [":visited", 0],
  [":link", 0],
  [":first-letter", 0],
  [":first-child", 2],
  [":before", 2],
  [":after", 2],
  [":lang(", 0],
  [":not(", 3],
  [":first-of-type", 0],
  [":last-of-type", 0],
  [":only-of-type", 0],
  [":only-child", 2],
  [":nth-child(", 3],
  [":nth-last-child(", 0],
  [":nth-of-type(", 0],
  [":nth-last-of-type(", 0],
  [":last-child", 2],
  [":root", 0],
  [":empty", 0],
  [":target", 0],
  [":enabled", 0],
  [":disabled", 0],
  [":checked", 1],
  ["::selection", 0]
];


//
// Searches and suggests selector completion based on input selector
//
function suggestSelectors() {
  var completion = new Completion();
  var doc = this.global;
  if (!doc.querySelectorAll || !doc.getElementsByTagName) {
    return completion;
  }
  var query = this.selector;
  // Even though the selector matched atleast one node, there is still
  // possibility of suggestions.
  switch(this.selectorState) {
    case SELECTOR_STATES.null:
      query += "*";
      break;

    case SELECTOR_STATES.id:
    case SELECTOR_STATES.tag:
      query = query.slice(0, -1 * this.completing.length);
      break;

    case SELECTOR_STATES.class:
    case SELECTOR_STATES.pseudo:
      if (/^[.:]$/.test(this.completing)) {
        query = query.slice(0, -1 * this.completing.length);
      }
      else {
        query = query.slice(0, -1 * this.completing.length - 1);
      }
      break;
  }

  if (/[\s+>~]$/.test(query) &&
      this.selectorState != SELECTOR_STATES.attribute &&
      this.selectorState != SELECTOR_STATES.value) {
    query += "*";
  }

  this._suggestions = {
    ids: {},
    classes: {},
    tags: {},
  };

  switch(this.selectorState) {
    case SELECTOR_STATES.null:
    case SELECTOR_STATES.id:
    case SELECTOR_STATES.tag:
    case SELECTOR_STATES.class:
      if (!query) {
        var nodes = null, node, className, len, len2, i, j, classes;
        if (this.selectorState == SELECTOR_STATES.class) {
          nodes = doc.querySelectorAll("[class]");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            classes = node.classList ||
                      node.className.split(" ").filter(function(item) {
                        return item.length;
                      });
            len2 = classes.length;
            for (j = 0; j < len2; j++) {
              className = classes[j];
              this._suggestions.classes[className] =
                (this._suggestions.classes[className] || 0) + 1;
            }
          }
        }
        else if (this.selectorState == SELECTOR_STATES.id) {
          nodes = doc.querySelectorAll("[id]");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            this._suggestions.ids[node.id] = 1;
          }
        }
        else if (this.selectorState == SELECTOR_STATES.tag) {
          nodes = doc.getElementsByTagName("*");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            this._suggestions.tags[node.tagName] =
              (this._suggestions.tags[node.tagName] || 0) + 1;
          }
        }
      }
      else {
        this._suggestions = {
          ids: {},
          classes: {},
          tags: {}
        };

        var nodes = [], node, len, className, len2, classes;
        try {
          nodes = doc.querySelectorAll(query);
        } catch (ex) {}
        len = nodes.length;
        for (var i = 0; i < len; i++) {
          node = nodes[i];
          classes = node.classList ||
                    node.className.split(" ").filter(function(item) {
                      return item.length;
                    });
          len2 = classes.length;
          this._suggestions.ids[node.id] = 1;
          this._suggestions.tags[node.tagName] =
            (this._suggestions.tags[node.tagName] || 0) + 1;
          for (var j = 0; j < len2; j++) {
            className = classes[j];
            this._suggestions.classes[className] =
              (this._suggestions.classes[className] || 0) + 1;
          }
        }
      }
      break;
  }

  // Filter the suggestions based on search box value.
  var result = [],
      firstPart = "";
  query = this.selector;
  if (this.selectorState == SELECTOR_STATES.tag) {
    // gets the tag that is being completed. For ex. 'div.foo > s' returns 's',
    // 'di' returns 'di' and likewise.
    firstPart = (query.match(/[\s>+~]?([a-zA-Z]*)$/) || ["",query])[1];
    for (var tag in this._suggestions.tags) {
      if (tag.toLowerCase().indexOf(firstPart.toLowerCase()) == 0) {
        result.push([tag, this._suggestions.tags[tag]]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.class) {
    // gets the class that is being completed. For ex. '.foo.b' returns 'b'
    firstPart = query.match(/\.([^\.]*)$/)[1];
    for (var className in this._suggestions.classes) {
      if (className.indexOf(firstPart) == 0) {
        result.push(["." + className, this._suggestions.classes[className]]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.id) {
    // gets the id that is being completed. For ex. '.foo#b' returns 'b'
    firstPart = query.match(/#([^#]*)$/)[1];
    for (var id in this._suggestions.ids) {
      if (id.indexOf(firstPart) == 0) {
        result.push(["#" + id, 1]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.pseudo) {
    result = PSEUDO_SUGGESTIONS.filter(function(item) {
      return item[0].indexOf(":" + this.completing) == 0;
    }.bind(this))
  }

  // Sort alphabetically in increaseing order.
  result = result.sort();
  // Sort based on count in decreasing order.
  result = result.sort(function(a, b) {
    return b[1] - a[1];
  });

  var total = 0;
  var value, len = result.length;
  for (var i = 0; i < len; i++) {
    value = result[i][0];
    switch(this.selectorState) {
      case SELECTOR_STATES.pseudo:
        // make the score 0 since it doesn't actually mean anything here.
        result[i][1] = 0;
      case SELECTOR_STATES.class:
      if (/^[.:]$/.test(this.completing)) {
          value = query.slice(0, -1 * this.completing.length) + value;
        }
        else {
          value = query.slice(0, -1 * this.completing.length - 1) + value;
        }
        break;

      case SELECTOR_STATES.tag:
        value = value.toLowerCase();
      default:
       value = query.slice(0, -1 * this.completing.length) + value;
    }
    completion.insert(new Candidate(value, query, result[i][1]));
    if (++total > this.maxEntries - 1) {
      break;
    }
  }
  return completion;
}

CSS.prototype.suggestSelectors = suggestSelectors;
