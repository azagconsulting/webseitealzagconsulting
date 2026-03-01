import fs from "node:fs";
import path from "node:path";

import Script from "next/script";

const stylesheets = [
  "/alzag-consulting/assets/vendors/bootstrap/css/bootstrap.min.css",
  "/alzag-consulting/assets/vendors/bootstrap-select/bootstrap-select.min.css",
  "/alzag-consulting/assets/vendors/jquery-ui/jquery-ui.css",
  "/alzag-consulting/assets/vendors/animate/animate.min.css",
  "/alzag-consulting/assets/vendors/fontawesome/css/all.min.css",
  "/alzag-consulting/assets/vendors/ogency-icons/style.css",
  "/alzag-consulting/assets/vendors/jarallax/jarallax.css",
  "/alzag-consulting/assets/vendors/jquery-magnific-popup/jquery.magnific-popup.css",
  "/alzag-consulting/assets/vendors/nouislider/nouislider.min.css",
  "/alzag-consulting/assets/vendors/nouislider/nouislider.pips.css",
  "/alzag-consulting/assets/vendors/odometer/odometer.min.css",
  "/alzag-consulting/assets/vendors/tiny-slider/tiny-slider.min.css",
  "/alzag-consulting/assets/vendors/owl-carousel/assets/owl.carousel.min.css",
  "/alzag-consulting/assets/vendors/owl-carousel/assets/owl.theme.default.min.css",
  "/alzag-consulting/assets/css/ogency.css",
];

const scripts = [
  "/alzag-consulting/assets/vendors/jquery/jquery-3.5.1.min.js",
  "/alzag-consulting/assets/vendors/bootstrap/js/bootstrap.bundle.min.js",
  "/alzag-consulting/assets/vendors/bootstrap-select/bootstrap-select.min.js",
  "/alzag-consulting/assets/vendors/jquery-ui/jquery-ui.js",
  "/alzag-consulting/assets/vendors/jarallax/jarallax.min.js",
  "/alzag-consulting/assets/vendors/jquery-ajaxchimp/jquery.ajaxchimp.min.js",
  "/alzag-consulting/assets/vendors/jquery-appear/jquery.appear.min.js",
  "/alzag-consulting/assets/vendors/jquery-circle-progress/jquery.circle-progress.min.js",
  "/alzag-consulting/assets/vendors/jquery-magnific-popup/jquery.magnific-popup.min.js",
  "/alzag-consulting/assets/vendors/jquery-validate/jquery.validate.min.js",
  "/alzag-consulting/assets/vendors/nouislider/nouislider.min.js",
  "/alzag-consulting/assets/vendors/odometer/odometer.min.js",
  "/alzag-consulting/assets/vendors/tiny-slider/tiny-slider.min.js",
  "/alzag-consulting/assets/vendors/owl-carousel/owl.carousel.min.js",
  "/alzag-consulting/assets/vendors/wnumb/wNumb.min.js",
  "/alzag-consulting/assets/vendors/jquery-circleType/jquery.circleType.js",
  "/alzag-consulting/assets/vendors/jquery-lettering/jquery.lettering.min.js",
  "/alzag-consulting/assets/vendors/wow/wow.js",
  "/alzag-consulting/assets/vendors/isotope/isotope.js",
  "/alzag-consulting/assets/vendors/countdown/countdown.min.js",
  "/alzag-consulting/assets/js/ogency.js",
];

function normalizeHtml(rawHtml: string) {
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] ?? rawHtml;

  // Remove inline script tags from the imported HTML to avoid duplicate execution.
  let normalized = body.replace(/<script[\s\S]*?<\/script>/gi, "");

  normalized = normalized
    .replace(/(href|src)="assets\//g, '$1="/alzag-consulting/assets/')
    .replace(/url\(assets\//g, "url(/alzag-consulting/assets/")
    .replace(/(href|src)="(?!https?:|mailto:|tel:|#|\/)([^"]+\.html)"/g, (_, attr, target) => {
      if (target === "login.html") {
        return `${attr}="/mitarbeiterzugang"`;
      }
      return `${attr}="/alzag-consulting/${target}"`;
    });

  return normalized;
}

const sectionOrder = [
  { key: "header", marker: '<header class="main-header">' },
  { key: "hero", marker: '<section class="main-slider">' },
  { key: "clients", marker: '<div class="client-carousel' },
  { key: "about", marker: '<section class="about-one">' },
  { key: "features", marker: '<section class="feature-one">' },
  { key: "awards", marker: '<section class="award-one">' },
  { key: "banner", marker: '<section class="hero-banner hero-banner--compact"' },
  { key: "projects", marker: '<section class="project-one' },
  { key: "why", marker: '<section class="why-choose-two">' },
  { key: "testimonials", marker: '<section class="testimonial-one"' },
  { key: "faq", marker: '<section class="faq-page">' },
  { key: "blog", marker: '<section class="blog-one">' },
  { key: "cta", marker: '<section class="cta-two">' },
  { key: "footer", marker: '<footer class="main-footer"' },
] as const;

function splitIntoSections(content: string) {
  const points = sectionOrder
    .map((entry) => ({ ...entry, index: content.indexOf(entry.marker) }))
    .filter((entry) => entry.index >= 0);

  if (points.length === 0) {
    return {
      prelude: "",
      sections: [] as Array<{ key: string; html: string }>,
      postlude: content,
    };
  }

  const prelude = content.slice(0, points[0].index);
  const sections = points.map((point, idx) => {
    const start = point.index;
    const end = idx + 1 < points.length ? points[idx + 1].index : content.length;
    return {
      key: point.key,
      html: content.slice(start, end),
    };
  });
  const last = sections[sections.length - 1];
  const postlude = content.slice(content.lastIndexOf(last.html) + last.html.length);

  return { prelude, sections, postlude };
}

function HtmlBlock({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function StaticHeadAssets() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.gstatic.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap"
        rel="stylesheet"
      />
      {stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  );
}

function StaticScripts() {
  return (
    <>
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
    </>
  );
}

export function StaticAlzagIndexPage() {
  const filePath = path.join(
    process.cwd(),
    "public",
    "alzag-consulting",
    "index.html",
  );
  const html = fs.readFileSync(filePath, "utf8");
  const content = normalizeHtml(html);
  const { prelude, sections, postlude } = splitIntoSections(content);

  return (
    <>
      <StaticHeadAssets />
      <HtmlBlock html={prelude} />
      {sections.map((section) => (
        <HtmlBlock key={section.key} html={section.html} />
      ))}
      <HtmlBlock html={postlude} />
      <StaticScripts />
    </>
  );
}
