(function () {
  "use strict";

  var CONFIG_ENDPOINT = "/api/v1/chatbot/config";
  var MESSAGE_ENDPOINT = "/api/v1/chatbot/message";
  var PRIVACY_POLICY_URL = "datenschutz.html";
  var CONSENT_UI_ACCEPT_TEXT = "Datenschutz-Einwilligung per Checkbox bestätigt.";

  var widget;
  var body;
  var form;
  var input;
  var sendButton;
  var toggleButton;
  var isSending = false;
  var typingNode = null;
  var conversation = [];

  function isOpen() {
    return Boolean(widget && widget.classList.contains("is-open"));
  }

  function scrollToLatest() {
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }

  function cleanInlineText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function appendMultilineText(parent, text, className) {
    var normalized = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!normalized) return;

    var lines = normalized
      .split(/\n+/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    if (!lines.length) return;

    var wrapper = document.createElement("div");
    wrapper.className = className;

    lines.forEach(function (line) {
      var paragraph = document.createElement("p");
      paragraph.textContent = line;
      wrapper.appendChild(paragraph);
    });

    parent.appendChild(wrapper);
  }

  function parseSlotSuggestionMessage(text) {
    var source = String(text || "");
    if (!source || !/Terminoption/i.test(source) || !/Uhrzeit:/i.test(source)) {
      return null;
    }

    var optionRegex =
      /(\d+)\.\s*Terminoption\s*Datum:\s*(.*?)\s*Uhrzeit:\s*(.*?)\s*Leistung:\s*(.*?)(?=\s*\d+\.\s*Terminoption|\s*Bitte wählen Sie|\s*Bitte waehlen Sie|$)/gis;
    var match;
    var options = [];

    while ((match = optionRegex.exec(source)) !== null) {
      options.push({
        index: match.index,
        raw: match[0],
        number: cleanInlineText(match[1]),
        date: cleanInlineText(match[2]),
        time: cleanInlineText(match[3]),
        service: cleanInlineText(match[4]),
      });
    }

    if (!options.length) return null;

    var intro = source.slice(0, options[0].index).trim();

    return {
      intro: cleanInlineText(intro),
      options: options,
    };
  }

  function appendSlotRow(parent, label, value) {
    var row = document.createElement("div");
    row.className = "alzag-chat-widget__slot-row";

    var labelNode = document.createElement("span");
    labelNode.className = "alzag-chat-widget__slot-label";
    labelNode.textContent = label + ":";

    var valueNode = document.createElement("span");
    valueNode.className = "alzag-chat-widget__slot-value";
    valueNode.textContent = value;

    row.appendChild(labelNode);
    row.appendChild(valueNode);
    parent.appendChild(row);
  }

  function markSelectedSlotCard(sourceNode) {
    if (!sourceNode || !sourceNode.closest) return;

    var card = sourceNode.closest(".alzag-chat-widget__slot-card");
    if (!card) return;

    var list = card.closest(".alzag-chat-widget__slot-list");
    if (!list) return;

    var cards = list.querySelectorAll(".alzag-chat-widget__slot-card");
    Array.prototype.forEach.call(cards, function (node) {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
      var button = node.querySelector(".alzag-chat-widget__slot-choose");
      if (button) {
        button.classList.remove("is-selected");
        button.textContent = "Wählen";
      }
    });

    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");

    var ownButton = card.querySelector(".alzag-chat-widget__slot-choose");
    if (ownButton) {
      ownButton.classList.add("is-selected");
      ownButton.textContent = "Gewählt";
    }
  }

  function submitSlotChoice(choice, sourceNode) {
    var value = cleanInlineText(choice);
    if (!value || isSending) return;
    markSelectedSlotCard(sourceNode);
    sendUserMessage(value, { clearInput: true });
  }

  function isConsentRequestMessage(text) {
    var source = String(text || "");
    if (!source) return false;

    var hasCoreSentence =
      /Um einen Termin bestätigen zu können/i.test(source) ||
      /Um einen Termin bestaetigen zu koennen/i.test(source);
    var hasConsentTopic = /Einwilligung/i.test(source) && /Datenschutz/i.test(source);

    return hasCoreSentence && hasConsentTopic;
  }

  function normalizeMessageLines(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)
      .filter(function (line) {
        return !/^-{3,}$/.test(line);
      });
  }

  function readPrefixedValue(line, prefixes) {
    var source = String(line || "");
    var lowered = source.toLowerCase();
    for (var index = 0; index < prefixes.length; index += 1) {
      var prefix = prefixes[index];
      var key = String(prefix || "").toLowerCase() + ":";
      if (lowered.indexOf(key) === 0) {
        return cleanInlineText(source.slice(key.length));
      }
    }
    return "";
  }

  function parseBookingMessageFields(text) {
    var lines = normalizeMessageLines(text);
    var data = {
      termin: "",
      name: "",
      phone: "",
      email: "",
      privacy: "",
      status: "",
      confirmation: "",
      question: "",
      hint: "",
    };

    var termMode = false;
    var termParts = [];

    lines.forEach(function (line) {
      if (
        /^Bitte prüfen Sie Ihre Angaben:?$/i.test(line) ||
        /^Bitte pruefen Sie Ihre Angaben:?$/i.test(line) ||
        /^Ihr Termin wurde verbindlich eingetragen\.?$/i.test(line)
      ) {
        termMode = false;
        return;
      }

      if (/^(Termin|Kontaktdaten|Datenschutz|Status|Bestätigung|Bestaetigung)$/i.test(line)) {
        termMode = /^Termin$/i.test(line);
        return;
      }

      var value = readPrefixedValue(line, ["Termin", "Ausgewählter Termin", "Ausgewaehlter Termin"]);
      if (value) {
        data.termin = value;
        termMode = false;
        return;
      }

      value = readPrefixedValue(line, ["Name"]);
      if (value) {
        data.name = value;
        return;
      }

      value = readPrefixedValue(line, ["Telefon"]);
      if (value) {
        data.phone = value;
        return;
      }

      value = readPrefixedValue(line, ["E-Mail", "Email"]);
      if (value) {
        data.email = value;
        return;
      }

      value = readPrefixedValue(line, ["Datenschutz", "Datenschutz-Einwilligung"]);
      if (value) {
        data.privacy = value;
        return;
      }

      value = readPrefixedValue(line, ["Buchungsstatus"]);
      if (value) {
        data.status = value;
        return;
      }

      if (/^Soll ich den Termin jetzt verbindlich buchen\?$/i.test(line)) {
        data.question = line;
        termMode = false;
        return;
      }

      if (/^Bitte antworten Sie/i.test(line) || /^Antworten Sie/i.test(line)) {
        data.hint = line;
        return;
      }

      if (/^Best[äa]tigungs-E-Mail/i.test(line) || /^Der Termin ist gespeichert/i.test(line)) {
        data.confirmation = line;
        return;
      }

      if (termMode) {
        termParts.push(line);
      }
    });

    if (!data.termin && termParts.length) {
      data.termin = cleanInlineText(termParts.join(" "));
    }

    return data;
  }

  function parseBookingReviewMessage(text) {
    var source = String(text || "");
    if (!/Bitte prüfen Sie Ihre Angaben/i.test(source) && !/Bitte pruefen Sie Ihre Angaben/i.test(source)) {
      return null;
    }

    var data = parseBookingMessageFields(source);
    if (!data.termin && !data.name && !data.phone && !data.email) return null;
    return data;
  }

  function parseBookingConfirmationMessage(text) {
    var source = String(text || "");
    if (!/Ihr Termin wurde verbindlich eingetragen/i.test(source)) {
      return null;
    }

    var data = parseBookingMessageFields(source);
    if (!data.termin && !data.status && !data.confirmation) return null;
    return data;
  }

  function appendBookingRow(parent, label, value) {
    if (!value) return;

    var row = document.createElement("div");
    row.className = "alzag-chat-widget__booking-row";

    var labelNode = document.createElement("span");
    labelNode.className = "alzag-chat-widget__booking-label";
    labelNode.textContent = label + ":";

    var valueNode = document.createElement("span");
    valueNode.className = "alzag-chat-widget__booking-value";
    valueNode.textContent = value;

    row.appendChild(labelNode);
    row.appendChild(valueNode);
    parent.appendChild(row);
  }

  function renderBookingCard(item, data, options) {
    item.classList.add("alzag-chat-widget__msg--booking");

    var header = document.createElement("div");
    header.className = "alzag-chat-widget__booking-head";
    header.textContent = options && options.heading ? options.heading : "Termin";
    item.appendChild(header);

    var card = document.createElement("article");
    card.className = "alzag-chat-widget__booking-card";
    if (options && options.confirmed) {
      card.classList.add("is-confirmed");
    }

    appendBookingRow(card, "Termin", data.termin);
    appendBookingRow(card, "Name", data.name);
    appendBookingRow(card, "Telefon", data.phone);
    appendBookingRow(card, "E-Mail", data.email);
    appendBookingRow(card, "Datenschutz", data.privacy);
    appendBookingRow(card, "Status", data.status);

    if (data.confirmation) {
      var note = document.createElement("div");
      note.className = "alzag-chat-widget__booking-note";
      note.textContent = data.confirmation;
      card.appendChild(note);
    }

    item.appendChild(card);

    if (data.question || data.hint) {
      var footer = document.createElement("div");
      footer.className = "alzag-chat-widget__booking-footer";

      if (data.question) {
        var question = document.createElement("p");
        question.className = "alzag-chat-widget__booking-question";
        question.textContent = data.question;
        footer.appendChild(question);
      }

      if (data.hint) {
        var hint = document.createElement("p");
        hint.className = "alzag-chat-widget__booking-hint";
        hint.textContent = data.hint;
        footer.appendChild(hint);
      }

      item.appendChild(footer);
    }
  }

  function renderConsentCard(item, text) {
    item.classList.add("alzag-chat-widget__msg--consent");
    appendMultilineText(item, text, "alzag-chat-widget__consent-intro");

    var link = document.createElement("a");
    link.className = "alzag-chat-widget__consent-link";
    link.href = PRIVACY_POLICY_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Datenschutz im neuen Tab öffnen";
    item.appendChild(link);

    var consentId = "alzag-chat-consent-" + Date.now() + "-" + Math.floor(Math.random() * 10000);

    var checkWrap = document.createElement("label");
    checkWrap.className = "alzag-chat-widget__consent-check";
    checkWrap.setAttribute("for", consentId);

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = consentId;
    checkbox.className = "alzag-chat-widget__consent-checkbox";

    var checkText = document.createElement("span");
    checkText.className = "alzag-chat-widget__consent-text";
    checkText.textContent =
      "Ich habe den Datenschutzhinweis gelesen und willige in die Verarbeitung meiner Daten zur Terminorganisation ein.";

    checkWrap.appendChild(checkbox);
    checkWrap.appendChild(checkText);
    item.appendChild(checkWrap);

    var continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "alzag-chat-widget__consent-continue";
    continueButton.setAttribute("data-chat-privacy-continue", "true");
    continueButton.disabled = true;
    continueButton.textContent = "Weiter";
    item.appendChild(continueButton);

    checkbox.addEventListener("change", function () {
      continueButton.disabled = !checkbox.checked || isSending;
    });
  }

  function renderBotMessage(item, text) {
    if (isConsentRequestMessage(text)) {
      renderConsentCard(item, text);
      return;
    }

    var reviewData = parseBookingReviewMessage(text);
    if (reviewData) {
      renderBookingCard(item, reviewData, {
        heading: "Angaben zum Termin",
        confirmed: false,
      });
      return;
    }

    var confirmationData = parseBookingConfirmationMessage(text);
    if (confirmationData) {
      renderBookingCard(item, confirmationData, {
        heading: "Terminbestätigung",
        confirmed: true,
      });
      return;
    }

    var parsed = parseSlotSuggestionMessage(text);
    if (!parsed) {
      item.textContent = text;
      return;
    }

    item.classList.add("alzag-chat-widget__msg--slots");
    appendMultilineText(item, parsed.intro, "alzag-chat-widget__slot-intro");

    var options = document.createElement("div");
    options.className = "alzag-chat-widget__slot-list";

    parsed.options.forEach(function (option) {
      var card = document.createElement("article");
      card.className = "alzag-chat-widget__slot-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-chat-slot-choice", option.number);
      card.setAttribute("aria-label", "Terminoption " + option.number + " wählen");
      card.setAttribute("aria-pressed", "false");

      var title = document.createElement("div");
      title.className = "alzag-chat-widget__slot-title";
      title.textContent = "Terminoption " + option.number;
      card.appendChild(title);

      appendSlotRow(card, "Datum", option.date);
      appendSlotRow(card, "Uhrzeit", option.time);
      appendSlotRow(card, "Leistung", option.service);

      var actions = document.createElement("div");
      actions.className = "alzag-chat-widget__slot-actions";

      var chooseButton = document.createElement("button");
      chooseButton.type = "button";
      chooseButton.className = "alzag-chat-widget__slot-choose";
      chooseButton.setAttribute("data-chat-slot-choice", option.number);
      chooseButton.textContent = "Wählen";
      actions.appendChild(chooseButton);
      card.appendChild(actions);

      card.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        submitSlotChoice(option.number, card);
      });

      options.appendChild(card);
    });

    item.appendChild(options);
  }

  function appendMessage(text, type) {
    if (!body || !text) return null;

    var item = document.createElement("div");
    item.className = "alzag-chat-widget__msg " + (type === "user" ? "user" : "bot");
    if (type === "bot") {
      renderBotMessage(item, text);
    } else {
      item.textContent = text;
    }
    body.appendChild(item);
    scrollToLatest();
    return item;
  }

  function removeTypingNode() {
    if (typingNode && typingNode.parentNode) {
      typingNode.parentNode.removeChild(typingNode);
    }
    typingNode = null;
  }

  function sendUserMessage(text, options) {
    if (isSending) return;

    var value = String(text || "").trim();
    if (!value) return;

    appendMessage(value, "user");
    pushConversation("user", value);

    if (options && options.clearInput && input) {
      input.value = "";
    }
    syncSendState();

    typingNode = appendMessage("Marc schreibt ...", "bot");
    setSending(true);

    requestBotReply(value)
      .then(function (reply) {
        removeTypingNode();
        appendMessage(reply, "bot");
        pushConversation("assistant", reply);
      })
      .catch(function (error) {
        removeTypingNode();

        var reply =
          error instanceof Error && error.message
            ? error.message
            : "Der Arcto-Chatbot konnte gerade nicht antworten. Bitte versuchen Sie es erneut.";
        appendMessage(reply, "bot");
        pushConversation("assistant", reply);
      })
      .finally(function () {
        setSending(false);
        if (input) input.focus();
      });
  }

  function openWidget() {
    if (!widget) return;
    widget.classList.add("is-open");
    widget.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      if (input) input.focus();
    }, 60);
  }

  function closeWidget() {
    if (!widget) return;
    widget.classList.remove("is-open");
    widget.setAttribute("aria-hidden", "true");
  }

  function toggleWidget() {
    if (isOpen()) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  function syncSendState() {
    if (!sendButton || !input) return;
    sendButton.disabled = isSending || !input.value.trim();
  }

  function setSending(next) {
    isSending = Boolean(next);
    if (input) {
      input.disabled = isSending;
    }
    syncSendState();
  }

  function pushConversation(role, text) {
    if (!text) return;
    conversation.push({ role: role, text: text });
  }

  function seedConversationFromDom() {
    if (!body) return;
    var botMessages = body.querySelectorAll(".alzag-chat-widget__msg.bot");
    Array.prototype.forEach.call(botMessages, function (node) {
      var text = node && node.textContent ? node.textContent.trim() : "";
      if (text) pushConversation("assistant", text);
    });
  }

  function extractErrorMessage(payload, fallback) {
    if (!payload) return fallback;

    if (typeof payload === "string") return payload;

    if (Array.isArray(payload.message) && payload.message.length) {
      return payload.message.join(" ");
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    return fallback;
  }

  function requestBotReply(userText) {
    return fetch(MESSAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        message: userText,
        messages: conversation,
      }),
    }).then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (payload) {
            throw new Error(
              extractErrorMessage(payload, "Der Arcto-Chatbot ist gerade nicht erreichbar."),
            );
          });
      }

      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (payload) {
          var reply = payload && typeof payload.reply === "string" ? payload.reply.trim() : "";
          if (!reply) {
            throw new Error("Es wurde keine Antwort vom Arcto-Chatbot geliefert.");
          }
          return reply;
        });
    });
  }

  function submitMessage(event) {
    event.preventDefault();

    if (!input || isSending) return;

    var text = input.value.trim();
    if (!text) return;

    sendUserMessage(text, { clearInput: true });
  }

  function syncAvailability() {
    fetch(CONFIG_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json().catch(function () {
          return null;
        });
      })
      .then(function (payload) {
        if (!payload || typeof payload.enabled !== "boolean") return;
        if (payload.enabled) return;

        closeWidget();
        if (toggleButton) {
          toggleButton.style.display = "none";
        }
      })
      .catch(function () {
        // If config cannot be loaded we keep the launcher visible.
      });
  }

  function bindEvents() {
    if (toggleButton) {
      toggleButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleWidget();
      });
    }

    if (widget) {
      widget.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) return;

        var consentContinue =
          target.getAttribute("data-chat-privacy-continue") !== null
            ? target
            : target.closest("[data-chat-privacy-continue]");
        if (consentContinue) {
          event.preventDefault();
          event.stopPropagation();
          if (consentContinue.disabled || isSending) return;
          consentContinue.disabled = true;
          sendUserMessage(CONSENT_UI_ACCEPT_TEXT);
          return;
        }

        var slotChoice =
          target.getAttribute("data-chat-slot-choice") !== null
            ? target
            : target.closest("[data-chat-slot-choice]");
        if (slotChoice) {
          event.preventDefault();
          event.stopPropagation();
          submitSlotChoice(
            slotChoice.getAttribute("data-chat-slot-choice"),
            slotChoice,
          );
          return;
        }

        if (target.getAttribute("data-chat-widget-close") !== null || target.closest("[data-chat-widget-close]")) {
          closeWidget();
        }
      });
    }

    if (form) {
      form.addEventListener("submit", submitMessage);
    }

    if (input) {
      input.addEventListener("input", syncSendState);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen()) {
        closeWidget();
      }
    });
  }

  function init() {
    widget = document.getElementById("alzag-chat-widget");
    if (!widget) return;

    body = document.getElementById("alzag-chat-widget-body");
    form = document.getElementById("alzag-chat-widget-form");
    input = document.getElementById("alzag-chat-widget-input");
    sendButton = form ? form.querySelector(".alzag-chat-widget__send") : null;
    toggleButton = document.querySelector("[data-chat-widget-toggle='open']");

    seedConversationFromDom();
    bindEvents();
    syncSendState();
    syncAvailability();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
