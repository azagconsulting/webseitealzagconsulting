/* eslint-disable @next/next/no-page-custom-font */

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

export function AlzagAboutAssets() {
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
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="lazyOnload" />
      ))}
    </>
  );
}
