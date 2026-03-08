<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

require 'config.php';

session_start();

$maxRequests = 5; // Maximale Anzahl von Anfragen pro IP
$timeWindow = 60; // Zeitfenster in Sekunden

$clientIP = $_SERVER['REMOTE_ADDR'];

if (!isset($_SESSION['rate_limit'][$clientIP])) {
    $_SESSION['rate_limit'][$clientIP] = [
        'count' => 0,
        'timestamp' => time()
    ];
}

$currentTimestamp = time();
$session = $_SESSION['rate_limit'][$clientIP];

if ($currentTimestamp - $session['timestamp'] > $timeWindow) {
    $_SESSION['rate_limit'][$clientIP] = [
        'count' => 1,
        'timestamp' => $currentTimestamp
    ];
} else {
    $_SESSION['rate_limit'][$clientIP]['count']++;
}

if ($_SESSION['rate_limit'][$clientIP]['count'] > $maxRequests) {
    echo 'Rate Limit überschritten. Bitte versuchen Sie es später erneut.';
    die();
}

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (isset($_POST['security']) && $_POST['security'] == 'secure') {
    if (isset($_POST['captcha_value']) && $_POST['captcha_input'] == $_POST['captcha_value']) {
        $name = htmlspecialchars($_POST['name']);
        $email = htmlspecialchars($_POST['email']);
        $subject = htmlspecialchars($_POST['subject']);
        $message = htmlspecialchars($_POST['message']);

        $adminEmail = SMTP_EMAIL;
        $userEmail = $email;
        $subjectAdmin = EMAIL_SUBAD;
        $subjectUser = EMAIL_SUBUS;

        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $mail = new PHPMailer(true);

            try {
                $mail->isSMTP();
                $mail->Host = SMTP_SERVER;
                $mail->SMTPAuth = true;
                $mail->Username = SMTP_USERNAME;
                $mail->Password = SMTP_PASSWORD;
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port = SMTP_PORT;

                $mail->CharSet = 'UTF-8';
                $mail->Encoding = 'base64';

                $mail->setFrom(SMTP_EMAIL, EMAIL_ABN);
                $mail->addAddress($adminEmail);
                $mail->isHTML(true);
                $mail->Subject = $subjectAdmin;
                $mail->Body = "
                <html>
                <head>
                    <title>Neue Kontaktanfrage</title>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #212121; color: #ffffff; }
                        .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #333333; border-radius: 10px; }
                        p { font-size: 16px; line-height: 1.6; color: #ffffff; }
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <h2>Neue Kontaktanfrage</h2>
                        <p><strong>Name:</strong> $name</p>
                        <p><strong>Email:</strong> $email</p>
                        <p><strong>Betreff:</strong> $subject</p>
                        <p><strong>Nachricht:</strong><br>$message</p>
                    </div>
                </body>
                </html>";

                $mail->send();

                $mail->clearAddresses();

                $mail->addAddress($userEmail);
                $mail->Subject = $subjectUser;
                $mail->Body = "
                <html>
                <head>
                    <title>Kontaktanfrage eingegangen</title>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #212121; color: #ffffff; }
                        .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #333333; border-radius: 10px; }
                        p { font-size: 16px; line-height: 1.6; color: #ffffff; }
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <p>Vielen Dank für Ihre Kontaktanfrage. Wir werden uns so schnell wie möglich bei Ihnen melden.</p>
                        <p>Mit freundlichen Grüßen <br>Autohaus Herrmann</p>
                    </div>
                </body>
                </html>";

                $mail->send();

                echo 'Danke für Ihre Nachricht! Wir werden uns bald bei Ihnen melden.';
            } catch (Exception $e) {
                echo "Nachricht konnte nicht gesendet werden. Fehler: {$mail->ErrorInfo}";
            }
        } else {
            echo 'Ungültige E-Mail-Adresse.';
        }
    } else {
        echo 'Captcha falsch. Bitte versuchen Sie es erneut.';
    }
}
?>
