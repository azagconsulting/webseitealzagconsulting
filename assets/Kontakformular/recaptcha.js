$(document).ready(function() {
    const captchaElement = document.getElementById('captcha');
    const refreshButton = document.getElementById('refresh-captcha');
    const captchaInput = document.getElementById('captcha-input');
    const hiddenCaptcha = document.getElementById('hiddenCaptcha');
    const popup = document.getElementById('popup');
    let captchaValue;

    function generateCaptcha() {
        captchaValue = Math.floor(100 + Math.random() * 900); // Generate a 3-digit number
        captchaElement.textContent = captchaValue;
        hiddenCaptcha.value = captchaValue;
    }

    refreshButton.addEventListener('click', generateCaptcha);

    $('#contactForm').on('submit', function(event) {
        event.preventDefault(); // Prevent the default form submission

        const userInput = captchaInput.value;
        const hiddenCaptchaValue = hiddenCaptcha.value;

        if (userInput != hiddenCaptchaValue) {
            showPopup('Captcha falsch. Bitte versuchen Sie es erneut.');
            generateCaptcha(); // Generate a new Captcha
            return false; // Stop further execution
        }

        // Formulardaten sammeln
        const formData = $(this).serialize();

        // Ajax-Anfrage senden
        $.ajax({
            type: 'POST',
            url: 'php/send_email.php',
            data: formData,
            success: function(response) {
                showPopup(response); // Antwort anzeigen
                $('#contactForm')[0].reset(); // Formular zurücksetzen
                generateCaptcha(); // Captcha erneuern
            },
            error: function(xhr, status, error) {
                console.error('Fehler bei der Ajax-Anfrage:', error);
            }
        });

        return false; // Ensure form submission is prevented
    });

    // Pop-up anzeigen
    function showPopup(message) {
        popup.textContent = message;
        popup.classList.add('show');
        setTimeout(() => {
            popup.classList.remove('show');
        }, 5000);
    }

    // Captcha beim Laden der Seite generieren
    generateCaptcha();
});
