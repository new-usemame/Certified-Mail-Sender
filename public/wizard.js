(function () {
  'use strict';

  var currentStep = 0;
  var quill = null;
  var pdfFile = null;

  var track = document.getElementById('wizardTrack');
  var viewport = document.querySelector('.wizard-viewport');
  var slides = track.querySelectorAll('.wizard-slide');
  var progressSteps = document.querySelectorAll('.wizard-progress-step');
  var connectors = document.querySelectorAll('.wizard-progress-connector');
  var progressBar = document.querySelector('.wizard-progress');

  function updateViewportHeight() {
    var activeSlide = slides[currentStep];
    viewport.style.height = activeSlide.scrollHeight + 'px';
  }

  // --- Quill init ---
  quill = new Quill('#quillEditor', {
    theme: 'snow',
    placeholder: 'Type or paste your letter here\u2026',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean']
      ]
    }
  });

  // --- Progressive reveal ---
  function setupReveal(streetId, revealId, cityId) {
    var street = document.getElementById(streetId);
    var group = document.getElementById(revealId);
    var city = document.getElementById(cityId);
    if (!street || !group) return;

    function reveal() {
      group.classList.add('revealed');
      setTimeout(updateViewportHeight, 360);
    }

    street.addEventListener('blur', function () {
      if (street.value.trim()) reveal();
    });

    street.addEventListener('change', function () {
      if (street.value.trim()) reveal();
    });

    if (city) {
      city.addEventListener('input', function () {
        if (city.value.trim()) reveal();
      });
    }

    if (street.value.trim()) reveal();
  }

  setupReveal('w_recipient_street', 'recipientReveal', 'w_recipient_city');
  setupReveal('w_sender_street', 'senderReveal', 'w_sender_city');

  // --- Content tabs ---
  var tabText = document.getElementById('tabText');
  var tabPdf = document.getElementById('tabPdf');
  var panelText = document.getElementById('panelText');
  var panelPdf = document.getElementById('panelPdf');

  function switchTab(tab) {
    var isText = tab === 'text';
    tabText.classList.toggle('active', isText);
    tabPdf.classList.toggle('active', !isText);
    tabText.setAttribute('aria-selected', isText ? 'true' : 'false');
    tabPdf.setAttribute('aria-selected', isText ? 'false' : 'true');
    panelText.style.display = isText ? '' : 'none';
    panelPdf.style.display = isText ? 'none' : '';
    hideContentError();
  }

  tabText.addEventListener('click', function () { switchTab('text'); });
  tabPdf.addEventListener('click', function () { switchTab('pdf'); });

  // --- PDF upload ---
  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('w_letter_pdf');
  var fileInfo = document.getElementById('pdfFileInfo');
  var fileName = document.getElementById('pdfFileName');
  var removeBtn = document.getElementById('pdfRemoveBtn');

  function handlePdfSelect(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showContentError('Please upload a PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showContentError('File is too large. Maximum size is 5 MB.');
      return;
    }
    pdfFile = file;
    fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
    dropzone.style.display = 'none';
    fileInfo.style.display = 'flex';
    hideContentError();
  }

  fileInput.addEventListener('change', function () {
    if (this.files[0]) handlePdfSelect(this.files[0]);
  });

  dropzone.addEventListener('click', function () { fileInput.click(); });

  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    this.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', function () {
    this.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    this.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handlePdfSelect(e.dataTransfer.files[0]);
  });

  removeBtn.addEventListener('click', function () {
    pdfFile = null;
    fileInput.value = '';
    dropzone.style.display = '';
    fileInfo.style.display = 'none';
  });

  // --- Content error ---
  var contentError = document.getElementById('contentError');

  function showContentError(msg) {
    contentError.textContent = msg;
    contentError.style.display = '';
  }

  function hideContentError() {
    contentError.style.display = 'none';
  }

  // --- Validation ---
  function clearErrors(container) {
    var errors = container.querySelectorAll('.field-error');
    for (var i = 0; i < errors.length; i++) errors[i].remove();
    var inputs = container.querySelectorAll('.has-error');
    for (var i = 0; i < inputs.length; i++) inputs[i].classList.remove('has-error');
  }

  function showError(input, msg) {
    input.classList.add('has-error');
    var err = document.createElement('div');
    err.className = 'field-error';
    err.textContent = msg;
    input.parentNode.insertBefore(err, input.nextSibling);
  }

  function validateRecipient() {
    var slide = slides[0];
    clearErrors(slide);
    var valid = true;

    var fields = [
      { id: 'w_recipient_name', label: 'Full name' },
      { id: 'w_recipient_street', label: 'Street address' }
    ];

    // Ensure reveal group is open for validation
    document.getElementById('recipientReveal').classList.add('revealed');

    fields.push(
      { id: 'w_recipient_city', label: 'City' },
      { id: 'w_recipient_state', label: 'State', pattern: /^[A-Z]{2}$/i, patternMsg: 'Enter a 2-letter state code' },
      { id: 'w_recipient_zip', label: 'ZIP', pattern: /^\d{5}(-?\d{4})?$/, patternMsg: 'Enter a valid ZIP code' }
    );

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var el = document.getElementById(f.id);
      var val = el.value.trim();
      if (!val) {
        showError(el, f.label + ' is required');
        valid = false;
      } else if (f.pattern && !f.pattern.test(val)) {
        showError(el, f.patternMsg);
        valid = false;
      }
    }

    return valid;
  }

  function validateSender() {
    var slide = slides[1];
    clearErrors(slide);
    var valid = true;

    document.getElementById('senderReveal').classList.add('revealed');

    var fields = [
      { id: 'w_sender_name', label: 'Full name' },
      { id: 'w_sender_street', label: 'Street address' },
      { id: 'w_sender_city', label: 'City' },
      { id: 'w_sender_state', label: 'State', pattern: /^[A-Z]{2}$/i, patternMsg: 'Enter a 2-letter state code' },
      { id: 'w_sender_zip', label: 'ZIP', pattern: /^\d{5}(-?\d{4})?$/, patternMsg: 'Enter a valid ZIP code' },
      { id: 'w_customer_email', label: 'Email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Enter a valid email address' }
    ];

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var el = document.getElementById(f.id);
      var val = el.value.trim();
      if (!val) {
        showError(el, f.label + ' is required');
        valid = false;
      } else if (f.pattern && !f.pattern.test(val)) {
        showError(el, f.patternMsg);
        valid = false;
      }
    }

    var backup = document.getElementById('w_backup_email');
    if (backup.value.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backup.value.trim())) {
        showError(backup, 'Enter a valid email address');
        valid = false;
      } else if (backup.value.trim().toLowerCase() === document.getElementById('w_customer_email').value.trim().toLowerCase()) {
        showError(backup, 'Backup email must be different from primary');
        valid = false;
      }
    }

    return valid;
  }

  function validateContent() {
    hideContentError();
    var isText = tabText.classList.contains('active');
    if (isText) {
      var text = quill.getText().trim();
      if (!text) {
        showContentError('Please write your letter before continuing.');
        return false;
      }
    } else {
      if (!pdfFile) {
        showContentError('Please upload a PDF before continuing.');
        return false;
      }
    }
    return true;
  }

  // --- Step navigation ---
  function goToStep(step) {
    if (step < 0 || step >= slides.length) return;

    currentStep = step;
    track.style.transform = 'translateX(-' + (step * 100) + '%)';

    for (var i = 0; i < slides.length; i++) {
      slides[i].setAttribute('aria-hidden', i === step ? 'false' : 'true');
    }

    for (var i = 0; i < progressSteps.length; i++) {
      var ps = progressSteps[i];
      ps.classList.remove('active', 'completed');
      if (i < step) ps.classList.add('completed');
      else if (i === step) ps.classList.add('active');
    }

    for (var i = 0; i < connectors.length; i++) {
      connectors[i].classList.toggle('completed', i < step);
    }

    progressBar.setAttribute('aria-valuenow', step + 1);

    if (step === 2) {
      populateReview();
      document.getElementById('wizardContent').style.display = 'none';
    } else {
      document.getElementById('wizardContent').style.display = '';
    }

    updateViewportHeight();

    var wizard = document.getElementById('wizard');
    wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setTimeout(function () {
      var firstInput = slides[step].querySelector('input:not([type="hidden"]):not([type="file"]), textarea, button.wizard-btn');
      if (firstInput && step !== 2) firstInput.focus();
    }, 420);
  }

  // --- Review population ---
  function formatAddress(prefix) {
    var name = document.getElementById('w_' + prefix + '_name').value.trim();
    var street = document.getElementById('w_' + prefix + '_street').value.trim();
    var street2 = document.getElementById('w_' + prefix + '_street2').value.trim();
    var city = document.getElementById('w_' + prefix + '_city').value.trim();
    var state = document.getElementById('w_' + prefix + '_state').value.trim().toUpperCase();
    var zip = document.getElementById('w_' + prefix + '_zip').value.trim();

    var html = '<strong>' + escapeHtml(name) + '</strong><br>';
    html += escapeHtml(street);
    if (street2) html += ', ' + escapeHtml(street2);
    html += '<br>' + escapeHtml(city) + ', ' + escapeHtml(state) + ' ' + escapeHtml(zip);
    return html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function populateReview() {
    document.getElementById('reviewToBody').innerHTML = formatAddress('recipient');

    var fromHtml = formatAddress('sender');
    var email = document.getElementById('w_customer_email').value.trim();
    fromHtml += '<br><span style="font-size:.85rem;color:#706A65">' + escapeHtml(email) + '</span>';
    document.getElementById('reviewFromBody').innerHTML = fromHtml;

    var isText = tabText.classList.contains('active');
    var letterHtml;
    if (isText) {
      var text = quill.getText().trim();
      var preview = text.length > 200 ? text.substring(0, 200) + '\u2026' : text;
      letterHtml = '<span style="font-size:.85rem;color:#706A65">Text letter</span><br>';
      letterHtml += '<em style="font-size:.85rem">\u201C' + escapeHtml(preview) + '\u201D</em>';
    } else {
      letterHtml = '<span style="font-size:.85rem">';
      letterHtml += '<svg style="width:.9rem;height:.9rem;vertical-align:-.1em;margin-right:.25rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      letterHtml += escapeHtml(pdfFile ? pdfFile.name : 'PDF uploaded');
      letterHtml += '</span>';
    }
    document.getElementById('reviewLetterBody').innerHTML = letterHtml;

    updatePrice();
  }

  // --- Price ---
  function updatePrice() {
    var rr = document.getElementById('w_return_receipt').checked;
    var display = document.getElementById('price_display');
    display.textContent = rr
      ? 'Total: $' + window.PRICES.certifiedRR
      : 'Total: $' + window.PRICES.certified;
  }

  document.getElementById('w_return_receipt').addEventListener('change', updatePrice);

  // --- Button handlers ---
  function scrollToFirstError(container) {
    var first = container.querySelector('.has-error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.getElementById('btnToSender').addEventListener('click', function () {
    if (validateRecipient()) {
      goToStep(1);
    } else {
      scrollToFirstError(slides[0]);
    }
  });

  document.getElementById('btnBackToRecipient').addEventListener('click', function () {
    goToStep(0);
  });

  document.getElementById('btnToReview').addEventListener('click', function () {
    var senderOk = validateSender();
    if (!senderOk) {
      scrollToFirstError(slides[1]);
      return;
    }
    if (!validateContent()) {
      document.getElementById('contentError').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    goToStep(2);
  });

  document.getElementById('btnBackToSender').addEventListener('click', function () {
    goToStep(1);
  });

  // Edit buttons in review cards
  document.querySelectorAll('.review-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = parseInt(this.getAttribute('data-goto'), 10);
      goToStep(step);
    });
  });

  // --- Form submission ---
  document.getElementById('btnSubmit').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Processing\u2026';

    var fieldMap = {
      sender_name: 'w_sender_name',
      sender_street: 'w_sender_street',
      sender_street2: 'w_sender_street2',
      sender_city: 'w_sender_city',
      sender_state: 'w_sender_state',
      sender_zip: 'w_sender_zip',
      customer_email: 'w_customer_email',
      backup_email: 'w_backup_email',
      recipient_name: 'w_recipient_name',
      recipient_street: 'w_recipient_street',
      recipient_street2: 'w_recipient_street2',
      recipient_city: 'w_recipient_city',
      recipient_state: 'w_recipient_state',
      recipient_zip: 'w_recipient_zip'
    };

    for (var hidden in fieldMap) {
      document.getElementById('h_' + hidden).value = document.getElementById(fieldMap[hidden]).value.trim();
    }

    var isText = tabText.classList.contains('active');
    document.getElementById('h_letter_mode').value = isText ? 'text' : 'pdf';

    if (isText) {
      document.getElementById('h_letter_text').value = quill.root.innerHTML;
    }

    document.getElementById('h_return_receipt').value = document.getElementById('w_return_receipt').checked ? '1' : '0';
    document.getElementById('h_use_sender_billing').value = document.getElementById('w_use_sender_billing').checked ? '1' : '0';

    var form = document.getElementById('hiddenForm');

    if (!isText && pdfFile) {
      var dt = new DataTransfer();
      dt.items.add(pdfFile);
      document.getElementById('h_letter_pdf').files = dt.files;
    }

    form.submit();
  });

  // --- Keyboard: Enter to advance ---
  slides[0].addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      document.getElementById('btnToSender').click();
    }
  });

  slides[1].addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      document.getElementById('btnToReview').click();
    }
  });

  updateViewportHeight();
  window.addEventListener('resize', updateViewportHeight);

})();
