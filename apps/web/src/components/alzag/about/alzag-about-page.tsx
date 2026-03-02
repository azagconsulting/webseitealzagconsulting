/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { AlzagAboutAssets } from "./alzag-about-assets";

function AboutHeader() {
  return (
    <>
      <header className="main-header">
        <nav className="main-menu">
          <div className="container-fluid">
            <div className="main-menu__logo">
              <a href="/" aria-label="Alzag Consulting Startseite">
                <img
                  src="/alzag-consulting/assets/images/logo-light.png"
                  width="90"
                  height="90"
                  alt="Alzag Consulting Logo"
                />
              </a>
            </div>
            <div className="main-menu__nav">
              <ul className="main-menu__list">
                <li>
                  <a href="/">Home</a>
                </li>
                <li className="current">
                  <a href="/ueberuns">Uber uns</a>
                </li>
                <li>
                  <a href="/alzag-consulting/unserservice.html">Unsere Dienstleistungen</a>
                </li>
                <li>
                  <a href="/alzag-consulting/contact.html">Kontakt</a>
                </li>
              </ul>
            </div>
            <div className="main-menu__right">
              <a href="#" className="main-menu__toggler mobile-nav__toggler" aria-label="Navigation oeffnen">
                <i className="fa fa-bars"></i>
              </a>
            </div>
          </div>
        </nav>
      </header>

      <div className="stricky-header stricked-menu main-menu">
        <div className="sticky-header__content"></div>
      </div>
    </>
  );
}

function AboutSections() {
  return (
    <>
      <section className="page-header">
        <div className="page-header__bg"></div>
        <div className="page-header__overlay"></div>
        <div className="container">
          <ul className="page-header__breadcrumb list-unstyled">
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <span>Uber uns</span>
            </li>
          </ul>
          <h2 className="page-header__title">Alzag Consulting</h2>
        </div>
      </section>

      <section className="about-three">
        <div className="container">
          <div className="row">
            <div className="col-lg-6">
              <div className="about-three__thumb">
                <div className="about-three__thumb--one wow fadeInLeft animated" data-wow-delay="300ms">
                  <img src="/alzag-consulting/assets/images/resources/about-3-1.jpg" alt="Alzag Team Workshop" />
                </div>
                <div className="about-three__thumb--two wow fadeInLeft animated" data-wow-delay="200ms">
                  <img src="/alzag-consulting/assets/images/resources/about-3-2.jpg" alt="Digitales Projektboard" />
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="about-three__content">
                <div className="section-title">
                  <h5 className="section-title__tagline section-title__tagline--has-dots">Uber Alzag Consulting</h5>
                  <h2 className="section-title__title">Wir bauen digitale Systeme, die im Alltag funktionieren</h2>
                </div>
                <h4 className="about-three__content__heading">
                  Strategie, Entwicklung und Betrieb aus einer Hand.
                </h4>
                <p className="about-three__content__text">
                  Wir entwickeln Webseiten, Kundenportale und Automationen, die Anfragen steigern und Teams entlasten.
                  Unser Fokus liegt auf klaren Prozessen, messbaren Ergebnissen und einer Umsetzung, die sich direkt in
                  Ihren Arbeitsalltag integriert.
                </p>
                <div className="about-three__author">
                  <div className="about-three__author__thumb">
                    <img src="/alzag-consulting/assets/images/resources/about-3-3.jpg" alt="Team Lead Alzag" />
                  </div>
                  <img src="/alzag-consulting/assets/images/resources/about-sign.png" alt="Alzag Signatur" width="223" />
                  <p className="about-three__author__meta">Alzag Team - Beratung & Umsetzung</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="why-choose-two">
        <div className="container">
          <div className="row">
            <div className="col-lg-7 wow fadeInLeft animated" data-wow-delay="200ms">
              <div className="why-choose-two__left">
                <div className="why-choose-two__img">
                  <img src="/alzag-consulting/assets/images/resources/why-choose-2-1.jpg" alt="Projektteam" />
                  <div className="why-choose-two__img-3">
                    <img src="/alzag-consulting/assets/images/resources/why-choose-2-3.jpg" alt="Umsetzung" />
                  </div>
                </div>
                <div className="why-choose-two__img-2">
                  <img src="/alzag-consulting/assets/images/resources/why-choose-2-2.jpg" alt="Zusammenarbeit" />
                </div>
              </div>
            </div>
            <div className="col-lg-5 wow fadeInRight animated" data-wow-delay="200ms">
              <div className="why-choose-two__right">
                <div className="section-title">
                  <h5 className="section-title__tagline section-title__tagline--has-dots">Was uns auszeichnet</h5>
                  <h2 className="section-title__title">Klare Kommunikation, saubere Technik, messbarer Fortschritt</h2>
                </div>
                <p className="why-choose-two__right--text">
                  Sie erhalten feste Ansprechpartner, kurze Feedback-Schleifen und transparente Priorisierung. Wir zeigen
                  klar, wie sich Leads, Auslastung und operative Kosten entwickeln, statt nur Features auszuliefern.
                </p>
                <div className="row">
                  <div className="col-md-6">
                    <div className="why-choose-two__box">
                      <div className="why-choose-two__box__icon">
                        <span className="icon-layers"></span>
                      </div>
                      <h3 className="why-choose-two__box__title">Verlaessliche Ablaeufe</h3>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="why-choose-two__box">
                      <div className="why-choose-two__box__icon">
                        <span className="icon-web-development"></span>
                      </div>
                      <h3 className="why-choose-two__box__title">Messbare Resultate</h3>
                    </div>
                  </div>
                </div>
                <a href="/alzag-consulting/contact.html" className="ogency-btn">
                  Kostenloses Erstgespraech buchen
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="team-one team-two">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <div className="section-title text-center">
                <h5 className="section-title__tagline section-title__tagline--has-dots">Unser Kernteam</h5>
                <h2 className="section-title__title">
                  Die Menschen hinter Strategie, Entwicklung
                  <br />
                  und skalierbaren Prozessen
                </h2>
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-lg-4 col-md-6 wow fadeInUp animated" data-wow-delay="100ms">
              <div className="team-one__item">
                <div className="team-one__item__image">
                  <img src="/alzag-consulting/assets/images/team/team-1-1.jpg" alt="Lead Development" />
                </div>
                <div className="team-one__item__content">
                  <span className="team-one__item__designation">Lead Development</span>
                  <h3 className="team-one__item__title">Web & Plattformen</h3>
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-6 wow fadeInUp animated" data-wow-delay="200ms">
              <div className="team-one__item">
                <div className="team-one__item__image">
                  <img src="/alzag-consulting/assets/images/team/team-1-2.jpg" alt="Growth & Content" />
                </div>
                <div className="team-one__item__content">
                  <span className="team-one__item__designation">Growth & Content</span>
                  <h3 className="team-one__item__title">Leads & Positionierung</h3>
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-6 wow fadeInUp animated" data-wow-delay="300ms">
              <div className="team-one__item">
                <div className="team-one__item__image">
                  <img src="/alzag-consulting/assets/images/team/team-1-3.jpg" alt="Automation & Operations" />
                </div>
                <div className="team-one__item__content">
                  <span className="team-one__item__designation">Automation & Operations</span>
                  <h3 className="team-one__item__title">CRM & Prozesse</h3>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-page">
        <div className="container">
          <div className="section-title wow fadeInUp animated" data-wow-delay="200ms">
            <h5 className="section-title__tagline section-title__tagline--has-dots">Haeufige Fragen</h5>
            <h2 className="section-title__title">Antworten zu Zusammenarbeit und Umsetzung</h2>
          </div>
          <div className="row">
            <div className="col-xl-3 col-lg-4 wow fadeInLeft animated" data-wow-delay="300ms">
              <div className="faq-page__help">
                <div
                  className="faq-page__help__bg"
                  style={{ backgroundImage: "url(/alzag-consulting/assets/images/backgrounds/faq-help.jpg)" }}
                ></div>
                <div className="faq-page__help__icon">
                  <span className="icon-phone-call"></span>
                </div>
                <h3 className="faq-page__help__title">Direkte Rueckfragen?</h3>
                <p className="faq-page__help__text">Wir beraten Sie persoenlich.</p>
                <h5 className="faq-page__help__number">
                  <a href="tel:+493012345678">+49 30 12345678</a>
                </h5>
              </div>
            </div>
            <div className="col-xl-9 col-lg-8 wow fadeInRight animated" data-wow-delay="400ms">
              <div className="faq-page__accrodion" data-grp-name="faq-one-accrodion">
                <div className="accrodion active">
                  <div className="accrodion-title">
                    <h4>Wie startet ein Projekt mit Alzag Consulting?</h4>
                  </div>
                  <div className="accrodion-content" style={{ display: "block" }}>
                    <div className="inner">
                      <p>
                        Wir starten mit einem kompakten Workshop, priorisieren Ziele und definieren messbare KPIs. Danach
                        arbeiten wir in klaren Sprints mit regelmaessigen Reviews.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="accrodion">
                  <div className="accrodion-title">
                    <h4>Welche Leistungen uebernehmt ihr intern?</h4>
                  </div>
                  <div className="accrodion-content">
                    <div className="inner">
                      <p>
                        Von UX-Konzept, Entwicklung und Integrationen bis hin zu Tracking, Betrieb und iterativer
                        Optimierung erhalten Sie alles aus einem Team.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="accrodion">
                  <div className="accrodion-title">
                    <h4>Wie wird der Erfolg konkret gemessen?</h4>
                  </div>
                  <div className="accrodion-content">
                    <div className="inner">
                      <p>
                        Wir definieren ein KPI-Set aus Leads, Conversion, Durchlaufzeiten und Support-Aufwand und
                        dokumentieren die Entwicklung transparent in Reports und Dashboards.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-two">
        <div
          className="cta-two__bg"
          style={{ backgroundImage: "url(/alzag-consulting/assets/images/backgrounds/cta-bg-2.jpg)" }}
        ></div>
        <div className="container">
          <div className="row">
            <div className="col-md-7 col-lg-8 wow fadeInLeft animated" data-wow-delay="200ms">
              <div className="section-title">
                <h2 className="section-title__title">Bereit fuer eine Website, die wirklich verkauft?</h2>
              </div>
            </div>
            <div className="col-md-5 col-lg-4 text-end wow fadeInRight animated" data-wow-delay="300ms">
              <a href="/alzag-consulting/contact.html" className="ogency-btn">
                Kostenloses Erstgespraech buchen
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function AboutFooter() {
  return (
    <footer
      className="main-footer"
      style={{ backgroundImage: "url(/alzag-consulting/assets/images/backgrounds/footer-bg-1.png)" }}
    >
      <div className="container">
        <div className="main-footer__top wow fadeInUp animated" data-wow-delay="100ms">
          <a href="/" className="main-footer__logo">
            <img
              src="/alzag-consulting/assets/images/footer-logo.png"
              alt="Alzag Consulting"
              width="110"
              height="110"
            />
          </a>
          <div className="main-footer__social">
            <a href="https://twitter.com/">
              <i className="fab fa-twitter"></i>
            </a>
            <a href="https://www.facebook.com/">
              <i className="fab fa-facebook"></i>
            </a>
            <a href="https://www.pinterest.com/">
              <i className="fab fa-pinterest-p"></i>
            </a>
            <a href="https://www.instagram.com/">
              <i className="fab fa-instagram"></i>
            </a>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-8 col-md-6 wow fadeInUp animated" data-wow-delay="200ms">
            <div className="main-footer__about">
              <p className="footer-widget__text">Lassen Sie uns ueber Ihr digitales Vorhaben sprechen</p>
              <a className="ogency-btn main-footer__cta" href="/alzag-consulting/contact.html">
                Projekt anfragen
              </a>
            </div>
          </div>
          <div className="col-lg-2 col-md-3 wow fadeInUp animated" data-wow-delay="300ms">
            <div className="main-footer__navmenu">
              <ul>
                <li>
                  <a href="/ueberuns">Uber uns</a>
                </li>
                <li>
                  <a href="/alzag-consulting/unserservice.html">Leistungen</a>
                </li>
                <li>
                  <a href="/alzag-consulting/projects.html">Projekte</a>
                </li>
                <li>
                  <a href="/alzag-consulting/contact.html">Kontakt</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="col-lg-2 col-md-3 wow fadeInUp animated" data-wow-delay="400ms">
            <div className="main-footer__navmenu">
              <ul>
                <li>
                  <a href="/alzag-consulting/blog-grid-right.html">Insights</a>
                </li>
                <li>
                  <a href="/alzag-consulting/unserservice.html">Datenschutz</a>
                </li>
                <li>
                  <a href="/alzag-consulting/contact.html">Cookies</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="main-footer__copyright wow fadeInUp animated" data-wow-delay="500ms">
          © <span className="dynamic-year"></span> by <a href="/">ALZAG Consulting</a>
        </p>
      </div>
    </footer>
  );
}

export function AlzagAboutPage() {
  return (
    <>
      <AlzagAboutAssets />

      <div className="custom-cursor__cursor"></div>
      <div className="custom-cursor__cursor-two"></div>

      <div className="preloader">
        <div
          className="preloader__image"
          style={{ backgroundImage: "url(/alzag-consulting/assets/images/loader.png)" }}
        ></div>
      </div>

      <div className="mobile-nav__wrapper">
        <div className="mobile-nav__overlay mobile-nav__toggler"></div>
        <div className="mobile-nav__content">
          <span className="mobile-nav__close mobile-nav__toggler">
            <i className="fa fa-times"></i>
          </span>
          <div className="logo-box">
            <a href="/" aria-label="logo image">
              <img src="/alzag-consulting/assets/images/logo-light.png" width="90" alt="Alzag Consulting" />
            </a>
          </div>
          <div className="mobile-nav__container"></div>
          <ul className="mobile-nav__contact list-unstyled">
            <li>
              <i className="fas fa-envelope"></i>
              <a href="mailto:hallo@alzag-consulting.de">hallo@alzag-consulting.de</a>
            </li>
            <li>
              <i className="icon-phone-call"></i>
              <a href="tel:+493012345678">+49 30 12345678</a>
            </li>
          </ul>
          <div className="mobile-nav__social">
            <a href="https://twitter.com/">
              <i className="fab fa-twitter"></i>
            </a>
            <a href="https://www.facebook.com/">
              <i className="fab fa-facebook"></i>
            </a>
            <a href="https://www.instagram.com/">
              <i className="fab fa-instagram"></i>
            </a>
          </div>
        </div>
      </div>

      <div className="search-popup">
        <div className="search-popup__overlay search-toggler"></div>
        <div className="search-popup__content">
          <form action="#">
            <label htmlFor="search" className="sr-only">
              Suche
            </label>
            <input type="text" id="search" placeholder="Suchen..." />
            <button type="submit" aria-label="Suche starten" className="ogency-btn">
              <i className="icon-magnifying-glass"></i>
            </button>
          </form>
        </div>
      </div>

      <a href="#" className="scroll-top" aria-label="Nach oben">
        <svg className="scroll-top__circle" width="100%" height="100%" viewBox="-1 -1 102 102">
          <path d="M50,1 a49,49 0 0,1 0,98 a49,49 0 0,1 0,-98" />
        </svg>
      </a>

      <div className="page-wrapper">
        <AboutHeader />
        <AboutSections />
        <AboutFooter />
      </div>
    </>
  );
}
