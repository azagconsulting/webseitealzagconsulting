<?php

define('SMTP_EMAIL', 'alexander.zaglmayr@gmx.de'); // Absender E-Mail

// SMTP Servereinstellungen
define('SMTP_SERVER', 'mail.gmx.net'); // SMTP-Serveradresse
define('SMTP_USERNAME', 'alexander.zaglmayr@gmx.de'); // Benutzername/E-Mail für E-Mail Konto
define('SMTP_PASSWORD', 'martina1999'); // E-Mail Passwort
define('SMTP_PORT', 587); // Server Port, keine Anführungszeichen

// Email an Admin
define('EMAIL_ABN', 'Autohaus Herrmann'); // Absendername
define('EMAIL_SUBAD', 'Eine neue Kontaktformularanfrage ist eingetroffen.'); // Betreff
// Email Text bearbeitung ab Zeile 86 send_email.php


// Email an Absender
define('EMAIL_SUBUS', 'Ihre Kontaktanfrage bei Autohaus Herrmann!'); // Betreff
// Email Text bearbeitung ab Zeile 117 send_email.php

?>
