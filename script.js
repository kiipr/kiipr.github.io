/* Kiipr static site — vanilla JS */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- data */

  var TAB_LABELS = ["Clip", "Snip"];

  var MOCK_DATA = [
    [
      { text: "systemctl --user status kiipr", time: "now", pinned: true },
      {
        text: "curl -sSL https://raw.githubusercontent.com/dip-bash/kiipr/main/install.sh | bash",
        time: "1m ago",
      },
      { text: "https://github.com/dip-bash/kiipr", time: "4m ago" },
      { text: "image-20261123-104512.png", time: "12m ago", badge: "PNG" },
      { text: "/home/dip/dev/proj/kiipr", time: "1h ago", badge: "DIR" },
      { text: "ssh -i ~/.ssh/id_ed25519 deploy@203.0.113.7 -p 2222", time: "2h ago" },
    ],
    [
      { name: "deploy", text: "make deploy ENV=production", pinned: true, command: true },
      { name: "disk", text: "df -h /", command: true },
      { name: "mail", text: "me@example.com" },
      { name: "sig", text: "Best regards, Dip" },
      { name: "shrug", text: "¯\\_(ツ)_/¯" },
    ],
  ];

  var COMMANDS = [
    {
      label: "Install",
      cmd: "curl -sSL https://raw.githubusercontent.com/dip-bash/kiipr/main/install.sh | bash",
    },
    {
      label: "Uninstall",
      cmd: "curl -sSL https://raw.githubusercontent.com/dip-bash/kiipr/main/uninstall.sh | bash",
    },
    { label: "Launch", cmd: "kiipr" },
    { label: "Status", cmd: "systemctl --user status kiipr.service" },
  ];

  var KEYBINDINGS = [
    ["Tab", "switch Clip / Snip"],
    ["j / k", "move"],
    ["i", "search (Esc leaves it)"],
    ["f", "toggle fuzzy search"],
    ["Enter", "copy and close"],
    ["d d", "delete (press twice)"],
    ["u", "undo a delete"],
    ["Clip", ""],
    ["e", "view: text, picture, files"],
    ["p", "pin / unpin"],
    ["Snip", ""],
    ["a", "add a snippet"],
    ["e", "edit"],
    ["r", "run a command snippet"],
    ["?", "toggle this help"],
    ["Esc", "close a popup / quit"],
  ];

  var HINTS = [
    "Enter copy · e view · d delete · i search · Tab snip · ? help",
    "Enter copy · r run · a add · e edit · Tab clip · ? help",
  ];

  /* ------------------------------------------------------------- helpers */

  function fuzzyMatch(pattern, str) {
    var p = pattern.toLowerCase();
    var s = str.toLowerCase();
    var pi = 0;
    var si = 0;
    while (pi < p.length && si < s.length) {
      if (p[pi] === s[si]) pi++;
      si++;
    }
    return pi === p.length;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------------------------------------------------------- star count */

  var starEl = document.getElementById("star-count");
  if (starEl) {
    fetch("https://api.github.com/repos/dip-bash/kiipr")
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (d && typeof d.stargazers_count === "number") {
          starEl.textContent = String(d.stargazers_count);
        }
      })
      .catch(function () {});
  }

  /* -------------------------------------------------------- command tabs */

  var cmdTabs = document.getElementById("cmd-tabs");
  var cmdText = document.getElementById("cmd-text");
  var cmdCopy = document.getElementById("cmd-copy");
  var activeCmd = 0;
  var cmdTimer = null;

  function renderCommands() {
    if (!cmdTabs || !cmdText) return;
    cmdTabs.innerHTML = "";
    COMMANDS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === activeCmd));
      b.textContent = c.label;
      b.addEventListener("click", function () {
        activeCmd = i;
        renderCommands();
      });
      cmdTabs.appendChild(b);
    });
    cmdText.textContent = COMMANDS[activeCmd].cmd;
  }

  if (cmdCopy) {
    cmdCopy.addEventListener("click", function () {
      copyText(COMMANDS[activeCmd].cmd).then(function () {
        cmdCopy.textContent = "Copied";
        if (cmdTimer) clearTimeout(cmdTimer);
        cmdTimer = setTimeout(function () {
          cmdCopy.textContent = "Copy";
        }, 2000);
      });
    });
  }

  renderCommands();

  /* ------------------------------------------------------- terminal demo */

  var term = document.getElementById("term");
  var termTabs = document.getElementById("term-tabs");
  var listEl = document.getElementById("list");
  var searchEl = document.getElementById("search");
  var modeEl = document.getElementById("mode");
  var helpEl = document.getElementById("help");
  var helpList = document.getElementById("help-list");
  var viewEl = document.getElementById("view");
  var viewTitle = document.getElementById("view-title");
  var viewBody = document.getElementById("view-body");
  var toastEl = document.getElementById("toast");
  var countEl = document.getElementById("count");
  var hintEl = document.getElementById("hint");

  if (!term || !listEl) return;

  var items = MOCK_DATA.map(function (arr) {
    return arr.map(function (i) {
      return {
        name: i.name || "",
        text: i.text,
        time: i.time || "",
        pinned: !!i.pinned,
        badge: i.badge || "",
        command: !!i.command,
      };
    });
  });
  var tab = 0;
  var mode = "NORMAL";
  var query = "";
  var fuzzy = true;
  var selected = 0;
  var helpOpen = false;
  var viewOpen = false;
  var undoStack = [];
  var toastTimer = null;
  var runTimer = null;

  function haystack(item) {
    return item.name ? item.name + " " + item.text : item.text;
  }

  function visible() {
    var data = items[tab].slice().sort(function (a, b) {
      return a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1;
    });
    if (!query) return data;
    var q = query.toLowerCase();
    return data.filter(function (i) {
      return fuzzy ? fuzzyMatch(query, haystack(i)) : haystack(i).toLowerCase().indexOf(q) !== -1;
    });
  }

  function flash(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 1400);
  }

  function renderTabs() {
    termTabs.innerHTML = "";
    TAB_LABELS.forEach(function (label, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === tab));
      b.textContent = label;
      b.addEventListener("click", function () {
        tab = i;
        selected = 0;
        render();
      });
      termTabs.appendChild(b);
    });
  }

  function renderHelp() {
    if (!helpList) return;
    helpList.innerHTML = "";
    KEYBINDINGS.forEach(function (pair) {
      var li = document.createElement("li");
      if (!pair[1]) li.className = "section";
      var kbd = document.createElement("kbd");
      kbd.textContent = pair[0];
      var span = document.createElement("span");
      span.textContent = pair[1];
      li.appendChild(kbd);
      li.appendChild(span);
      helpList.appendChild(li);
    });
  }

  function render() {
    renderTabs();

    var list = visible();
    if (selected >= list.length) selected = Math.max(0, list.length - 1);

    listEl.innerHTML = "";
    if (list.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No matches found";
      listEl.appendChild(empty);
    } else {
      list.forEach(function (item, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === selected));
        if (i === selected) li.className = "sel";

        var caret = document.createElement("span");
        caret.className = "caret";
        caret.setAttribute("aria-hidden", "true");
        caret.textContent = i === selected ? "→" : "";
        li.appendChild(caret);

        if (item.pinned) {
          var pin = document.createElement("span");
          pin.className = "pin";
          pin.setAttribute("aria-hidden", "true");
          pin.textContent = "●";
          li.appendChild(pin);
        }

        if (item.command) {
          var marker = document.createElement("span");
          marker.className = "marker";
          marker.setAttribute("aria-hidden", "true");
          marker.textContent = "$";
          li.appendChild(marker);
        }

        if (item.name) {
          var name = document.createElement("span");
          name.className = "name";
          name.textContent = item.name;
          li.appendChild(name);
        }

        var text = document.createElement("span");
        text.className = "text";
        text.textContent = item.text;
        li.appendChild(text);

        if (item.badge) {
          var badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = item.badge;
          li.appendChild(badge);
        }

        if (item.time) {
          var time = document.createElement("span");
          time.className = "time";
          time.textContent = item.time;
          li.appendChild(time);
        }

        li.addEventListener("click", function () {
          selected = i;
          render();
        });

        listEl.appendChild(li);
      });

      var selNode = listEl.children[selected];
      if (selNode && selNode.scrollIntoView) {
        selNode.scrollIntoView({ block: "nearest" });
      }
    }

    if (countEl) {
      countEl.textContent = list.length + (list.length === 1 ? " item" : " items");
    }
    if (modeEl) {
      modeEl.textContent = mode;
      modeEl.className = mode === "SEARCH" ? "mode search" : "mode";
    }
    if (hintEl) hintEl.textContent = HINTS[tab];
    if (helpEl) helpEl.hidden = !helpOpen;
    if (viewEl) viewEl.hidden = !viewOpen;
  }

  function currentItem() {
    return visible()[selected];
  }

  function doPin() {
    var cur = currentItem();
    if (!cur) return;
    cur.pinned = !cur.pinned;
    render();
  }

  function doDelete() {
    var cur = currentItem();
    if (!cur) return;
    var index = items[tab].indexOf(cur);
    items[tab].splice(index, 1);
    undoStack.push({ tab: tab, item: cur, index: index });
    selected = Math.min(selected, Math.max(0, visible().length - 1));
    render();
  }

  function doUndo() {
    var last = undoStack.pop();
    if (!last) {
      flash("Nothing to undo");
      return;
    }
    tab = last.tab;
    items[tab].splice(last.index, 0, last.item);
    selected = last.index;
    render();
    flash("Restored");
  }

  function doCopy() {
    var cur = currentItem();
    if (!cur) return;
    copyText(cur.text).then(function () {
      flash("Copied to clipboard");
    });
  }

  function doRun() {
    var cur = currentItem();
    if (!cur) return;
    if (!cur.command) {
      flash("Text snippet: press Enter to copy");
      return;
    }
    flash("$ " + cur.text);
    if (runTimer) clearTimeout(runTimer);
    runTimer = setTimeout(function () {
      flash(cur.name + " finished · exit 0");
    }, 1200);
  }

  function doView() {
    var cur = currentItem();
    if (!cur) return;
    viewOpen = true;
    helpOpen = false;
    if (viewTitle) viewTitle.textContent = cur.name ? cur.name : cur.badge ? cur.badge + " preview" : "Text preview";
    if (viewBody) viewBody.textContent = cur.text;
    render();
  }

  if (searchEl) {
    searchEl.addEventListener("input", function () {
      query = searchEl.value;
      selected = 0;
      render();
    });
    searchEl.addEventListener("focus", function () {
      mode = "SEARCH";
      render();
    });
    searchEl.addEventListener("blur", function () {
      mode = "NORMAL";
      render();
    });
  }

  term.addEventListener("keydown", function (e) {
    if (viewOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        viewOpen = false;
        render();
      } else if (e.key === "Enter" || e.key === "y") {
        e.preventDefault();
        copyText(viewBody ? viewBody.textContent : "").then(function () {
          flash("Copied to clipboard");
        });
        viewOpen = false;
        render();
      }
      return;
    }

    if (helpOpen && e.key !== "?" && e.key !== "Escape") return;

    if (e.key === "Tab") {
      e.preventDefault();
      tab = (tab + 1) % TAB_LABELS.length;
      selected = 0;
      render();
      return;
    }

    if (mode === "SEARCH") {
      if (e.key === "Escape") {
        e.preventDefault();
        mode = "NORMAL";
        if (searchEl) searchEl.blur();
        term.focus();
        render();
      }
      return;
    }

    switch (e.key) {
      case "j":
        e.preventDefault();
        selected = Math.min(selected + 1, Math.max(0, visible().length - 1));
        render();
        break;
      case "k":
        e.preventDefault();
        selected = Math.max(0, selected - 1);
        render();
        break;
      case "i":
      case "/":
        e.preventDefault();
        mode = "SEARCH";
        render();
        if (searchEl) searchEl.focus();
        break;
      case "f":
        e.preventDefault();
        fuzzy = !fuzzy;
        selected = 0;
        render();
        flash(fuzzy ? "Fuzzy search on" : "Fuzzy search off");
        break;
      case "p":
        e.preventDefault();
        doPin();
        break;
      case "d":
        e.preventDefault();
        doDelete();
        break;
      case "u":
        e.preventDefault();
        doUndo();
        break;
      case "y":
      case "Enter":
        e.preventDefault();
        doCopy();
        break;
      case "e":
        e.preventDefault();
        doView();
        break;
      case "r":
        e.preventDefault();
        doRun();
        break;
      case "?":
        e.preventDefault();
        helpOpen = !helpOpen;
        viewOpen = false;
        render();
        break;
      case "Escape":
        e.preventDefault();
        helpOpen = false;
        viewOpen = false;
        render();
        break;
    }
  });

  renderHelp();
  render();
})();
