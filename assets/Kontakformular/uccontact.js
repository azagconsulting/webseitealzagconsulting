document.addEventListener('DOMContentLoaded', function() {
    const contactButton = document.querySelector('.contact-button');
    const overlay = document.querySelector('.overlay');
    const contactPopup = document.querySelector('.contact-popup');
    const closeButton = document.querySelector('.close-button');

    contactButton.addEventListener('click', function() {
        overlay.classList.add('open');
        contactPopup.classList.remove('slide-up');
        contactPopup.classList.add('slide-down');
    });

    closeButton.addEventListener('click', function() {
        contactPopup.classList.remove('slide-down');
        contactPopup.classList.add('slide-up');
        setTimeout(() => {
            overlay.classList.remove('open');
        }, 500); // Match the duration of the slideUp animation
    });

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            contactPopup.classList.remove('slide-down');
            contactPopup.classList.add('slide-up');
            setTimeout(() => {
                overlay.classList.remove('open');
            }, 500); // Match the duration of the slideUp animation
        }
    });
});
