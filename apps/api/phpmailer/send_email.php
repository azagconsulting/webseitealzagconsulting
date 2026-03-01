<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/../../tools/PHPMailer/src/Exception.php';
require __DIR__ . '/../../tools/PHPMailer/src/PHPMailer.php';
require __DIR__ . '/../../tools/PHPMailer/src/SMTP.php';

$input = stream_get_contents(STDIN);
$payload = json_decode($input ?: '', true);

if (!is_array($payload)) {
    fwrite(STDERR, "Ungültiger JSON Payload.\n");
    exit(1);
}

$smtp = $payload['smtp'] ?? null;
$message = $payload['message'] ?? null;

if (!is_array($smtp) || !is_array($message)) {
    fwrite(STDERR, "SMTP- oder Nachrichten-Daten fehlen.\n");
    exit(1);
}

$smtpHost = (string)($smtp['host'] ?? '');
$smtpPort = (int)($smtp['port'] ?? 587);
$smtpUser = (string)($smtp['username'] ?? '');
$smtpPassword = (string)($smtp['password'] ?? '');
$smtpEncryption = strtolower((string)($smtp['encryption'] ?? 'tls'));

$fromEmail = (string)($message['fromEmail'] ?? $smtpUser);
$fromName = (string)($message['fromName'] ?? '');
$toEmail = (string)($message['to'] ?? '');
$subject = (string)($message['subject'] ?? '');
$textBody = (string)($message['text'] ?? '');
$htmlBody = $message['html'] ?? null;
$replyTo = isset($message['replyTo']) ? (string)$message['replyTo'] : null;

if ($smtpHost === '' || $smtpUser === '' || $smtpPassword === '' || $toEmail === '') {
    fwrite(STDERR, "Erforderliche SMTP- oder Empfänger-Daten fehlen.\n");
    exit(1);
}

$mailer = new PHPMailer(true);

try {
    $mailer->isSMTP();
    $mailer->CharSet = 'UTF-8';
    $mailer->Host = $smtpHost;
    $mailer->Port = $smtpPort;
    $mailer->SMTPAuth = true;
    $mailer->Username = $smtpUser;
    $mailer->Password = $smtpPassword;

    if ($smtpEncryption === 'ssl') {
        $mailer->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($smtpEncryption === 'tls') {
        $mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    } else {
        $mailer->SMTPSecure = false;
    }

    $mailer->setFrom($fromEmail, $fromName);
    $mailer->addAddress($toEmail);
    if (!empty($replyTo)) {
        $mailer->addReplyTo($replyTo);
    }

    $mailer->Subject = $subject;

    if (is_string($htmlBody) && $htmlBody !== '') {
        $mailer->isHTML(true);
        $mailer->Body = $htmlBody;
        $mailer->AltBody = $textBody !== '' ? $textBody : strip_tags($htmlBody);
    } else {
        $mailer->isHTML(false);
        $mailer->Body = $textBody;
        $mailer->AltBody = $textBody;
    }

    $mailer->send();

    echo json_encode([
        'messageId' => $mailer->getLastMessageID(),
        'status' => 'sent',
    ]);
} catch (Exception $exception) {
    $errorMessage = $mailer->ErrorInfo ?: $exception->getMessage();
    fwrite(STDERR, $errorMessage . "\n");
    echo json_encode([
        'error' => 'send_failed',
        'message' => $errorMessage,
    ]);
    exit(1);
}
