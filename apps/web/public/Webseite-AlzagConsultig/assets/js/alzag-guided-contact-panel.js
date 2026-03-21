(function () {
  "use strict";

  var STYLE_ID = "alzag-guided-contact-style";
  var ROOT_ID = "alzag-guided-contact-root";
  var API_ENDPOINT = "/api/v1/public/contact";

  var GOAL_OPTIONS = [
    { value: "website", label: "Neue Website / Relaunch" },
    { value: "leads", label: "Mehr Anfragen / Leads" },
    { value: "automation", label: "Prozesse digitalisieren" },
    { value: "strategy", label: "Strategische Beratung" },
  ];

  var TIMELINE_OPTIONS = [
    { value: "asap", label: "Sofort (0-4 Wochen)" },
    { value: "quarter", label: "Im naechsten Quartal" },
    { value: "later", label: "In 3-6 Monaten" },
    { value: "explore", label: "Erst orientieren" },
  ];

  var WEBSITE_CHECK_FOCUS_OPTIONS = [
    { value: "visibility", label: "Sichtbarkeit & SEO" },
    { value: "conversion", label: "Anfragen & Conversion" },
    { value: "clarity", label: "Angebot & Vertrauen" },
    { value: "technical", label: "Technik, Mobil & Ladezeit" },
  ];

  var FORM_FLOWS = {
    default: {
      key: "default",
      eyebrow: "Kontaktpanel",
      title: "Projekt kurz anfragen",
      text: "In vier kurzen Schritten erfassen wir die wichtigsten Infos fuer dein Erstgespraech.",
      step2Type: "goal",
      step2Label: "Wobei sollen wir dich unterstuetzen?",
      step2Error: "Bitte waehle dein Hauptziel aus.",
      step3Name: "timeline",
      step3Label: "Wann willst du starten?",
      step3Options: TIMELINE_OPTIONS,
      step3Error: "Bitte waehle den gewuenschten Startzeitraum.",
      detailsLabel: "Noch ein kurzer Kontext (optional)",
      detailsPlaceholder: "Kurz zu Ziel, Standort oder aktuellem Stand...",
      submitLabel: "Anfrage senden",
      submittingLabel: "Wird gesendet...",
    },
    "website-check": {
      key: "website-check",
      eyebrow: "Website-Check",
      title: "Website-Check starten",
      text: "In vier kurzen Schritten erfassen wir die wichtigsten Infos fuer die persoenliche Pruefung deiner digitalen Praesenz.",
      step2Type: "website",
      step2Label: "Welche Website sollen wir pruefen?",
      step2Error: "Bitte gib die Website deines Unternehmens an.",
      step2Hint: "Bitte gib die URL ein, z. B. https://deine-firma.de",
      step3Name: "checkFocus",
      step3Label: "Was sollen wir im Check priorisieren?",
      step3Options: WEBSITE_CHECK_FOCUS_OPTIONS,
      step3Error: "Bitte waehle den Schwerpunkt fuer den Website-Check.",
      detailsLabel: "Kurzer Kontext zur Website (optional)",
      detailsPlaceholder: "Optional: Welche Seiten oder Probleme sollen wir besonders pruefen?",
      submitLabel: "Website-Check senden",
      submittingLabel: "Wird gesendet...",
      successText: "Rückmeldung innerhalb von 24 Stunden da die digitale Präsenz persönlich überprüft wird.",
    },
  };

  var state = {
    flow: "default",
    step: 1,
    fullName: "",
    company: "",
    goal: "",
    timeline: "",
    websiteUrl: "",
    checkFocus: "",
    email: "",
    phone: "",
    details: "",
  };

  var ui = {
    root: null,
    panel: null,
    progressBar: null,
    stepLabel: null,
    stepEyebrow: null,
    stepTitle: null,
    stepText: null,
    stepNodes: [],
    step2Label: null,
    step2Choices: null,
    step2WebsiteField: null,
    step2WebsiteInput: null,
    step2WebsiteHint: null,
    step3Label: null,
    step3Choices: null,
    detailsLabel: null,
    detailsInput: null,
    step4Hint: null,
    errorBox: null,
    backButton: null,
    nextButton: null,
    submitButton: null,
    closeButtons: [],
    successBox: null,
    successSummary: null,
  };

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "body.alzag-guided-contact-open{overflow:hidden}" +
      ".alzag-guided-contact{position:fixed;inset:0;z-index:12000;display:none}" +
      ".alzag-guided-contact.is-open{display:block}" +
      ".alzag-guided-contact__backdrop{position:absolute;inset:0;background:rgba(5,5,6,.56);backdrop-filter:blur(7px)}" +
      ".alzag-guided-contact__panel{position:absolute;right:0;top:0;height:100%;width:min(560px,100%);display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(var(--ogency-black2-rgb),.99),rgba(var(--ogency-black-rgb),.98));border-left:1px solid rgba(var(--ogency-base-rgb),.5);box-shadow:-24px 0 60px -40px rgba(0,0,0,.95);transform:translateX(105%);transition:transform .28s ease;font-family:var(--ogency-font,'Plus Jakarta Sans',sans-serif)}" +
      ".alzag-guided-contact.is-open .alzag-guided-contact__panel{transform:translateX(0)}" +
      ".alzag-guided-contact__head{padding:22px 22px 16px;border-bottom:1px solid var(--ogency-black3)}" +
      ".alzag-guided-contact__eyebrow{margin:0;font-size:11px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;color:var(--ogency-base)}" +
      ".alzag-guided-contact__title{margin:6px 0 0;color:var(--ogency-white);font-size:28px;line-height:1.2;font-weight:800}" +
      ".alzag-guided-contact__text{margin:8px 0 0;color:#c9c9ce;font-size:13px;line-height:1.55}" +
      ".alzag-guided-contact__topline{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}" +
      ".alzag-guided-contact__close{border:1px solid var(--ogency-black3);background:transparent;color:#d1d1d6;min-width:38px;height:38px;cursor:pointer;font-size:20px;line-height:1;transition:.2s}" +
      ".alzag-guided-contact__close:hover{border-color:var(--ogency-base);color:var(--ogency-base)}" +
      ".alzag-guided-contact__progress{margin-top:14px}" +
      ".alzag-guided-contact__step-label{display:block;margin-bottom:8px;color:#c9c9ce;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}" +
      ".alzag-guided-contact__track{height:4px;background:var(--ogency-black3)}" +
      ".alzag-guided-contact__bar{height:4px;background:var(--ogency-base);width:25%;transition:width .25s ease}" +
      ".alzag-guided-contact__body{padding:18px 22px;overflow:auto;flex:1}" +
      ".alzag-guided-contact__error{display:none;margin:0 0 14px;padding:10px 12px;border:1px solid rgba(var(--ogency-base-rgb),.55);background:rgba(var(--ogency-base-rgb),.08);color:#f3e8b4;font-size:12px;line-height:1.5}" +
      ".alzag-guided-contact__error.is-visible{display:block}" +
      ".alzag-guided-contact__step{display:none}" +
      ".alzag-guided-contact__step.is-active{display:block}" +
      ".alzag-guided-contact__field{display:block;margin-bottom:14px}" +
      ".alzag-guided-contact__field span{display:block;margin-bottom:7px;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}" +
      ".alzag-guided-contact__input,.alzag-guided-contact__textarea{width:100%;border:1px solid var(--ogency-black3);background:var(--ogency-black2);color:#fff;padding:12px 12px;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s ease,box-shadow .2s ease}" +
      ".alzag-guided-contact__textarea{min-height:96px;resize:vertical}" +
      ".alzag-guided-contact__input:focus,.alzag-guided-contact__textarea:focus{border-color:var(--ogency-base);box-shadow:0 0 0 2px rgba(var(--ogency-base-rgb),.2)}" +
      ".alzag-guided-contact__choices{display:grid;grid-template-columns:1fr;gap:8px}" +
      ".alzag-guided-contact__choice{border:1px solid var(--ogency-black3);background:var(--ogency-black2);color:#fff;padding:12px;font-size:13px;text-align:left;cursor:pointer;transition:.2s}" +
      ".alzag-guided-contact__choice:hover{border-color:var(--ogency-base);color:var(--ogency-base)}" +
      ".alzag-guided-contact__choice.is-selected{border-color:var(--ogency-base);background:rgba(var(--ogency-base-rgb),.14);color:#f4eed1}" +
      ".alzag-guided-contact__hint{margin:10px 0 0;color:#b9b9be;font-size:12px;line-height:1.5}" +
      ".alzag-guided-contact__footer{display:flex;gap:8px;justify-content:flex-end;padding:14px 22px 20px;border-top:1px solid var(--ogency-black3)}" +
      ".alzag-guided-contact__btn{border:1px solid var(--ogency-black3);background:var(--ogency-black2);color:#fff;padding:11px 16px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:.2s;font-family:inherit}" +
      ".alzag-guided-contact__btn:hover{border-color:var(--ogency-base);color:var(--ogency-base)}" +
      ".alzag-guided-contact__btn[disabled]{opacity:.5;cursor:not-allowed}" +
      ".alzag-guided-contact__btn--primary{border-color:var(--ogency-base);background:var(--ogency-base);color:var(--ogency-black)}" +
      ".alzag-guided-contact__btn--primary:hover{background:var(--ogency-white);border-color:var(--ogency-white);color:var(--ogency-base)}" +
      ".alzag-guided-contact__success{display:none;padding:12px;border:1px solid rgba(var(--ogency-base-rgb),.55);background:rgba(var(--ogency-base-rgb),.1)}" +
      ".alzag-guided-contact__success.is-visible{display:block}" +
      ".alzag-guided-contact__success h4{margin:0;color:var(--ogency-white);font-size:19px;font-weight:800}" +
      ".alzag-guided-contact__success p{margin:8px 0 0;color:#d1d1d6;font-size:13px;line-height:1.55}";

    document.head.appendChild(style);
  }

  function createOptionsHtml(name, options) {
    return options
      .map(function (option) {
        return (
          '<button type="button" class="alzag-guided-contact__choice" data-choice-name="' +
          name +
          '" data-choice-value="' +
          option.value +
          '">' +
          option.label +
          "</button>"
        );
      })
      .join("");
  }

  function getFlowConfig(flowKey) {
    return FORM_FLOWS[flowKey] || FORM_FLOWS.default;
  }

  function applyFlowConfig() {
    if (!ui.root) return;

    var flow = getFlowConfig(state.flow);

    if (ui.stepEyebrow) ui.stepEyebrow.textContent = flow.eyebrow;
    if (ui.stepTitle) ui.stepTitle.textContent = flow.title;
    if (ui.stepText) ui.stepText.textContent = flow.text;
    if (ui.step2Label) ui.step2Label.textContent = flow.step2Label;
    if (ui.step3Label) ui.step3Label.textContent = flow.step3Label;
    if (ui.detailsLabel) ui.detailsLabel.textContent = flow.detailsLabel;
    if (ui.detailsInput) ui.detailsInput.placeholder = flow.detailsPlaceholder;

    if (ui.step4Hint) {
      ui.step4Hint.textContent =
        flow.key === "website-check"
          ? "Bitte mindestens E-Mail oder Telefon angeben. Wir melden uns innerhalb von 24 Stunden."
          : "Bitte mindestens E-Mail oder Telefon angeben.";
    }

    if (ui.submitButton) {
      ui.submitButton.textContent = flow.submitLabel;
    }

    if (ui.step2Choices) {
      ui.step2Choices.innerHTML =
        flow.step2Type === "goal" ? createOptionsHtml("goal", GOAL_OPTIONS) : "";
      ui.step2Choices.style.display = flow.step2Type === "goal" ? "grid" : "none";
    }

    if (ui.step2WebsiteField) {
      ui.step2WebsiteField.style.display = flow.step2Type === "website" ? "block" : "none";
    }

    if (ui.step2WebsiteHint) {
      ui.step2WebsiteHint.textContent = flow.step2Hint || "";
      ui.step2WebsiteHint.style.display = flow.step2Type === "website" ? "block" : "none";
    }

    if (ui.step3Choices) {
      ui.step3Choices.innerHTML = createOptionsHtml(flow.step3Name, flow.step3Options || []);
    }
  }

  function buildPanel() {
    if (document.getElementById(ROOT_ID)) {
      ui.root = document.getElementById(ROOT_ID);
      return;
    }

    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "alzag-guided-contact";
    root.setAttribute("aria-hidden", "true");

    root.innerHTML =
      '<div class="alzag-guided-contact__backdrop" data-close-panel="true"></div>' +
      '<aside class="alzag-guided-contact__panel" role="dialog" aria-modal="true" aria-label="Gefuehrtes Kontaktformular">' +
      '<div class="alzag-guided-contact__head">' +
      '<div class="alzag-guided-contact__topline">' +
      '<div>' +
      '<p class="alzag-guided-contact__eyebrow" id="alzag-guided-eyebrow">Kontaktpanel</p>' +
      '<h3 class="alzag-guided-contact__title" id="alzag-guided-title">Projekt kurz anfragen</h3>' +
      '<p class="alzag-guided-contact__text" id="alzag-guided-text">In vier kurzen Schritten erfassen wir die wichtigsten Infos fuer dein Erstgespraech.</p>' +
      '</div>' +
      '<button type="button" class="alzag-guided-contact__close" data-close-panel="true" aria-label="Panel schliessen">&times;</button>' +
      '</div>' +
      '<div class="alzag-guided-contact__progress">' +
      '<span class="alzag-guided-contact__step-label" id="alzag-guided-step-label">Schritt 1 von 4</span>' +
      '<div class="alzag-guided-contact__track"><div class="alzag-guided-contact__bar" id="alzag-guided-progress"></div></div>' +
      '</div>' +
      '</div>' +
      '<div class="alzag-guided-contact__body">' +
      '<p class="alzag-guided-contact__error" id="alzag-guided-error" role="alert"></p>' +
      '<div class="alzag-guided-contact__success" id="alzag-guided-success" aria-live="polite">' +
      '<h4>Danke fuer deine Anfrage.</h4>' +
      '<p id="alzag-guided-success-text"></p>' +
      '</div>' +
      '<section class="alzag-guided-contact__step is-active" data-step="1">' +
      '<label class="alzag-guided-contact__field"><span>Wie heisst du?</span><input class="alzag-guided-contact__input" type="text" name="fullName" autocomplete="name" placeholder="Vor- und Nachname" maxlength="180" /></label>' +
      '<label class="alzag-guided-contact__field"><span>Firma (optional)</span><input class="alzag-guided-contact__input" type="text" name="company" autocomplete="organization" placeholder="Firmenname" maxlength="180" /></label>' +
      '</section>' +
      '<section class="alzag-guided-contact__step" data-step="2">' +
      '<label class="alzag-guided-contact__field"><span id="alzag-guided-step2-label">Wobei sollen wir dich unterstuetzen?</span></label>' +
      '<div class="alzag-guided-contact__choices" id="alzag-guided-step2-choices" data-choices="goal">' +
      createOptionsHtml("goal", GOAL_OPTIONS) +
      '</div>' +
      '<label class="alzag-guided-contact__field" id="alzag-guided-website-field" style="display:none;">' +
      '<span>Website URL</span><input class="alzag-guided-contact__input" type="text" name="websiteUrl" autocomplete="url" placeholder="https://deine-firma.de" maxlength="240" />' +
      '</label>' +
      '<p class="alzag-guided-contact__hint" id="alzag-guided-website-hint" style="display:none;"></p>' +
      '</section>' +
      '<section class="alzag-guided-contact__step" data-step="3">' +
      '<label class="alzag-guided-contact__field"><span id="alzag-guided-step3-label">Wann willst du starten?</span></label>' +
      '<div class="alzag-guided-contact__choices" id="alzag-guided-step3-choices" data-choices="timeline">' +
      createOptionsHtml("timeline", TIMELINE_OPTIONS) +
      '</div>' +
      '</section>' +
      '<section class="alzag-guided-contact__step" data-step="4">' +
      '<label class="alzag-guided-contact__field"><span>E-Mail</span><input class="alzag-guided-contact__input" type="email" name="email" autocomplete="email" placeholder="name@firma.de" maxlength="180" /></label>' +
      '<label class="alzag-guided-contact__field"><span>Telefon (alternativ)</span><input class="alzag-guided-contact__input" type="text" name="phone" autocomplete="tel" placeholder="+49 ..." maxlength="60" /></label>' +
      '<label class="alzag-guided-contact__field"><span id="alzag-guided-details-label">Noch ein kurzer Kontext (optional)</span><textarea class="alzag-guided-contact__textarea" name="details" maxlength="800" placeholder="Kurz zu Ziel, Standort oder aktuellem Stand..."></textarea></label>' +
      '<p class="alzag-guided-contact__hint" id="alzag-guided-step4-hint">Bitte mindestens E-Mail oder Telefon angeben.</p>' +
      '</section>' +
      '</div>' +
      '<div class="alzag-guided-contact__footer">' +
      '<button type="button" class="alzag-guided-contact__btn" id="alzag-guided-back">Zurueck</button>' +
      '<button type="button" class="alzag-guided-contact__btn alzag-guided-contact__btn--primary" id="alzag-guided-next">Weiter</button>' +
      '<button type="button" class="alzag-guided-contact__btn alzag-guided-contact__btn--primary" id="alzag-guided-submit" style="display:none;">Anfrage senden</button>' +
      '</div>' +
      '</aside>';

    document.body.appendChild(root);

    ui.root = root;
    ui.panel = root.querySelector(".alzag-guided-contact__panel");
    ui.progressBar = root.querySelector("#alzag-guided-progress");
    ui.stepLabel = root.querySelector("#alzag-guided-step-label");
    ui.stepEyebrow = root.querySelector("#alzag-guided-eyebrow");
    ui.stepTitle = root.querySelector("#alzag-guided-title");
    ui.stepText = root.querySelector("#alzag-guided-text");
    ui.stepNodes = Array.prototype.slice.call(root.querySelectorAll(".alzag-guided-contact__step"));
    ui.step2Label = root.querySelector("#alzag-guided-step2-label");
    ui.step2Choices = root.querySelector("#alzag-guided-step2-choices");
    ui.step2WebsiteField = root.querySelector("#alzag-guided-website-field");
    ui.step2WebsiteInput = root.querySelector('input[name="websiteUrl"]');
    ui.step2WebsiteHint = root.querySelector("#alzag-guided-website-hint");
    ui.step3Label = root.querySelector("#alzag-guided-step3-label");
    ui.step3Choices = root.querySelector("#alzag-guided-step3-choices");
    ui.detailsLabel = root.querySelector("#alzag-guided-details-label");
    ui.detailsInput = root.querySelector('textarea[name="details"]');
    ui.step4Hint = root.querySelector("#alzag-guided-step4-hint");
    ui.errorBox = root.querySelector("#alzag-guided-error");
    ui.backButton = root.querySelector("#alzag-guided-back");
    ui.nextButton = root.querySelector("#alzag-guided-next");
    ui.submitButton = root.querySelector("#alzag-guided-submit");
    ui.closeButtons = Array.prototype.slice.call(root.querySelectorAll("[data-close-panel]"));
    ui.successBox = root.querySelector("#alzag-guided-success");
    ui.successSummary = root.querySelector("#alzag-guided-success-text");

    bindPanelEvents();
    applyFlowConfig();
    render();
  }

  function setError(message) {
    if (!ui.errorBox) return;
    if (!message) {
      ui.errorBox.textContent = "";
      ui.errorBox.classList.remove("is-visible");
      return;
    }
    ui.errorBox.textContent = message;
    ui.errorBox.classList.add("is-visible");
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/\s+/g, " ").trim();
  }

  function normalizeWebsiteUrl(url) {
    var value = String(url || "").trim();
    if (!value) return "";
    if (!/^https?:\/\//i.test(value)) {
      value = "https://" + value;
    }
    return value;
  }

  function isWebsiteUrlValid(url) {
    if (!url) return false;
    try {
      var parsed = new URL(normalizeWebsiteUrl(url));
      return Boolean(parsed.hostname && parsed.hostname.indexOf(".") > -1);
    } catch {
      return false;
    }
  }

  function collectInputs() {
    if (!ui.root) return;
    var fullNameInput = ui.root.querySelector('input[name="fullName"]');
    var companyInput = ui.root.querySelector('input[name="company"]');
    var websiteInput = ui.root.querySelector('input[name="websiteUrl"]');
    var emailInput = ui.root.querySelector('input[name="email"]');
    var phoneInput = ui.root.querySelector('input[name="phone"]');
    var detailsInput = ui.root.querySelector('textarea[name="details"]');

    state.fullName = fullNameInput ? String(fullNameInput.value || "").trim() : state.fullName;
    state.company = companyInput ? String(companyInput.value || "").trim() : state.company;
    state.websiteUrl = websiteInput ? String(websiteInput.value || "").trim() : state.websiteUrl;
    state.email = emailInput ? String(emailInput.value || "").trim() : state.email;
    state.phone = phoneInput ? normalizePhone(phoneInput.value || "") : state.phone;
    state.details = detailsInput ? String(detailsInput.value || "").trim() : state.details;
  }

  function isEmailValid(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateStep(step) {
    collectInputs();

    var flow = getFlowConfig(state.flow);

    if (step === 1) {
      if (!state.fullName || state.fullName.length < 2) {
        return "Bitte gib deinen Vor- und Nachnamen ein.";
      }
      return "";
    }

    if (step === 2) {
      if (flow.step2Type === "website") {
        if (!state.websiteUrl) {
          return flow.step2Error;
        }
        if (!isWebsiteUrlValid(state.websiteUrl)) {
          return "Bitte gib eine gueltige Website-URL ein.";
        }
        return "";
      }

      if (!state.goal) {
        return flow.step2Error;
      }
      return "";
    }

    if (step === 3) {
      var step3Name = flow.step3Name;
      if (!state[step3Name]) {
        return flow.step3Error;
      }
      return "";
    }

    if (step === 4) {
      if (!state.email && !state.phone) {
        return "Bitte gib mindestens E-Mail oder Telefon an.";
      }
      if (state.email && !isEmailValid(state.email)) {
        return "Bitte gib eine gueltige E-Mail-Adresse ein.";
      }
      return "";
    }

    return "";
  }

  function renderChoiceState() {
    if (!ui.root) return;

    var choices = ui.root.querySelectorAll(".alzag-guided-contact__choice");
    Array.prototype.forEach.call(choices, function (button) {
      var choiceName = button.getAttribute("data-choice-name");
      var choiceValue = button.getAttribute("data-choice-value");
      var selected = state[choiceName] === choiceValue;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function render() {
    if (!ui.root) return;

    setError("");

    ui.stepNodes.forEach(function (node) {
      var nodeStep = Number(node.getAttribute("data-step"));
      node.classList.toggle("is-active", nodeStep === state.step);
    });

    ui.stepLabel.textContent = "Schritt " + state.step + " von 4";
    ui.progressBar.style.width = String((state.step / 4) * 100) + "%";

    ui.backButton.style.display = state.step === 1 ? "none" : "inline-block";
    ui.nextButton.style.display = state.step < 4 ? "inline-block" : "none";
    ui.submitButton.style.display = state.step === 4 ? "inline-block" : "none";

    if (ui.successBox) {
      ui.successBox.classList.remove("is-visible");
    }

    renderChoiceState();
  }

  function nextStep() {
    var error = validateStep(state.step);
    if (error) {
      setError(error);
      return;
    }

    if (state.step < 4) {
      state.step += 1;
      render();
    }
  }

  function previousStep() {
    if (state.step > 1) {
      state.step -= 1;
      render();
    }
  }

  function resetState(skipRender) {
    state.step = 1;
    state.fullName = "";
    state.company = "";
    state.goal = "";
    state.timeline = "";
    state.websiteUrl = "";
    state.checkFocus = "";
    state.email = "";
    state.phone = "";
    state.details = "";

    if (!ui.root) return;

    var fullNameInput = ui.root.querySelector('input[name="fullName"]');
    var companyInput = ui.root.querySelector('input[name="company"]');
    var websiteInput = ui.root.querySelector('input[name="websiteUrl"]');
    var emailInput = ui.root.querySelector('input[name="email"]');
    var phoneInput = ui.root.querySelector('input[name="phone"]');
    var detailsInput = ui.root.querySelector('textarea[name="details"]');

    if (fullNameInput) fullNameInput.value = "";
    if (companyInput) companyInput.value = "";
    if (websiteInput) websiteInput.value = "";
    if (emailInput) emailInput.value = "";
    if (phoneInput) phoneInput.value = "";
    if (detailsInput) detailsInput.value = "";

    if (!skipRender) {
      applyFlowConfig();
      render();
    }
  }

  function buildMessage() {
    var flow = getFlowConfig(state.flow);

    if (flow.key === "website-check") {
      var focusLabel = WEBSITE_CHECK_FOCUS_OPTIONS.find(function (item) {
        return item.value === state.checkFocus;
      });

      var websiteParts = [
        "Anliegen: Website-Check",
        "Website: " + (normalizeWebsiteUrl(state.websiteUrl) || "-"),
        "Check-Fokus: " + (focusLabel ? focusLabel.label : "-"),
        "Quelle: Guided Contact Panel (Website-Check) (" + window.location.pathname + ")",
      ];

      if (state.details) {
        websiteParts.push("Details: " + state.details);
      }

      return websiteParts.join("\n");
    }

    var goalLabel = GOAL_OPTIONS.find(function (item) {
      return item.value === state.goal;
    });
    var timelineLabel = TIMELINE_OPTIONS.find(function (item) {
      return item.value === state.timeline;
    });

    var defaultParts = [
      "Anliegen: " + (goalLabel ? goalLabel.label : "-"),
      "Startzeitraum: " + (timelineLabel ? timelineLabel.label : "-"),
      "Quelle: Guided Contact Panel (" + window.location.pathname + ")",
    ];

    if (state.details) {
      defaultParts.push("Details: " + state.details);
    }

    return defaultParts.join("\n");
  }

  function setSubmitting(isSubmitting) {
    var flow = getFlowConfig(state.flow);
    ui.submitButton.disabled = isSubmitting;
    ui.backButton.disabled = isSubmitting;
    ui.nextButton.disabled = isSubmitting;
    ui.submitButton.textContent = isSubmitting ? flow.submittingLabel : flow.submitLabel;
  }

  function submit() {
    var error = validateStep(4);
    if (error) {
      setError(error);
      return;
    }

    var payload = {
      fullName: state.fullName,
      company: state.company || undefined,
      email: state.email || undefined,
      phone: state.phone || undefined,
      message: buildMessage(),
    };

    var flow = getFlowConfig(state.flow);

    setError("");
    setSubmitting(true);

    fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || "Anfrage konnte nicht gesendet werden.");
          });
        }
        return response.json().catch(function () {
          return {};
        });
      })
      .then(function () {
        if (ui.successBox) {
          ui.successSummary.textContent =
            flow.successText ||
            ("Wir melden uns zeitnah unter " +
              (state.email || state.phone || "deinen angegebenen Kontaktdaten") +
              ".");
          ui.successBox.classList.add("is-visible");
        }

        ui.nextButton.style.display = "none";
        ui.submitButton.style.display = "none";
        ui.backButton.style.display = "none";

        setTimeout(function () {
          closePanel();
          state.flow = "default";
          resetState();
        }, 1800);
      })
      .catch(function () {
        setError("Die Anfrage konnte gerade nicht gesendet werden. Bitte versuche es in wenigen Minuten erneut.");
      })
      .finally(function () {
        setSubmitting(false);
      });
  }

  function openPanel(options) {
    var flow = options && options.flow ? options.flow : "default";
    var prefillGoal = options && options.prefillGoal ? options.prefillGoal : "";

    state.flow = FORM_FLOWS[flow] ? flow : "default";
    resetState(true);

    if (prefillGoal && getFlowConfig(state.flow).step2Type === "goal") {
      state.goal = prefillGoal;
    }

    applyFlowConfig();

    if (ui.root) {
      ui.root.classList.add("is-open");
      ui.root.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("alzag-guided-contact-open");
    render();
  }

  function closePanel() {
    if (ui.root) {
      ui.root.classList.remove("is-open");
      ui.root.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("alzag-guided-contact-open");
    setError("");
  }

  function inferGoalFromText(text) {
    var lower = String(text || "").toLowerCase();
    if (/(website|webseite|relaunch)/.test(lower)) return "website";
    if (/(anfrage|lead|kunden|verkauf)/.test(lower)) return "leads";
    if (/(prozess|digital|automatisierung)/.test(lower)) return "automation";
    if (/(beratung|strategie|gespraech|termin)/.test(lower)) return "strategy";
    return "";
  }

  function inferFlowFromLink(link) {
    if (!link || !link.getAttribute) return "default";

    var explicit = String(link.getAttribute("data-contact-form") || "")
      .trim()
      .toLowerCase();
    if (explicit && FORM_FLOWS[explicit]) {
      return explicit;
    }

    var text = String(link.textContent || "").toLowerCase();
    var aria = String(link.getAttribute("aria-label") || "").toLowerCase();
    var classes = String(link.className || "").toLowerCase();
    var haystack = [text, aria, classes].join(" ");

    if (/(website-?check|seitencheck|praesenz)/.test(haystack)) {
      return "website-check";
    }

    return "default";
  }

  function shouldHandleLink(link) {
    if (!link || !link.getAttribute) return false;

    var href = String(link.getAttribute("href") || "").toLowerCase().trim();
    if (!href || href.indexOf("contact.html") === -1) return false;

    var text = (link.textContent || "").toLowerCase();
    if (/cookie/.test(text)) return false;
    if (/cart|checkout/.test(text)) return false;

    var aria = String(link.getAttribute("aria-label") || "").toLowerCase();
    var classes = String(link.className || "").toLowerCase();
    var haystack = [text, aria, classes].join(" ");

    return /(kontakt|erstgespr|termin|angebot|beratung|projekt|anfrage|website-?check|cta)/.test(haystack);
  }

  function bindTriggerLinks() {
    var links = document.querySelectorAll('a[href*="contact.html"], [data-contact-panel="open"]');
    Array.prototype.forEach.call(links, function (link) {
      if (!shouldHandleLink(link) && link.getAttribute("data-contact-panel") !== "open") {
        return;
      }

      link.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        var prefill = link.getAttribute("data-contact-goal") || inferGoalFromText(link.textContent || "");
        var flow = inferFlowFromLink(link);
        openPanel({ flow: flow, prefillGoal: prefill });
      });
    });
  }

  function bindPanelEvents() {
    if (!ui.root) return;

    ui.closeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        closePanel();
      });
    });

    ui.backButton.addEventListener("click", previousStep);
    ui.nextButton.addEventListener("click", nextStep);
    ui.submitButton.addEventListener("click", submit);

    ui.root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) return;

      var choiceName = target.getAttribute("data-choice-name");
      var choiceValue = target.getAttribute("data-choice-value");
      if (choiceName && choiceValue) {
        state[choiceName] = choiceValue;
        renderChoiceState();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && ui.root.classList.contains("is-open")) {
        closePanel();
      }
    });
  }

  function init() {
    ensureStyles();
    buildPanel();
    bindTriggerLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
