document.addEventListener('DOMContentLoaded', function () {
  var aiEnabled = document.getElementById('AI_ASSISTANT_ENABLED')
  var aiFields = document.querySelectorAll('.ai-only')

  function syncAiFields() {
    if (!aiEnabled) return
    aiFields.forEach(function (el) {
      el.hidden = !aiEnabled.checked
    })
  }

  if (aiEnabled) {
    aiEnabled.addEventListener('change', syncAiFields)
    syncAiFields()
  }

  var setupForm = document.getElementById('setup-form')
  var password = document.getElementById('DJANGO_SUPERUSER_PASSWORD')
  var confirmPassword = document.getElementById('confirm_password')
  var mismatchNotice = document.getElementById('password-mismatch')

  function passwordsMatch() {
    if (!password || !confirmPassword) return true
    var ok = password.value === confirmPassword.value
    if (mismatchNotice) mismatchNotice.hidden = ok
    if (!ok) confirmPassword.focus()
    return ok
  }

  var hostingMode = document.getElementById('HOSTING_MODE')
  var domainFields = document.querySelectorAll('.domain-only')
  var domainInput = document.getElementById('DOMAIN')

  function syncHostingMode() {
    if (!hostingMode) return
    var isDomain = hostingMode.value === 'domain'
    domainFields.forEach(function (el) {
      el.hidden = !isDomain
    })
    if (domainInput) {
      domainInput.required = isDomain
      if (!isDomain) domainInput.value = ''
    }
  }

  if (hostingMode) {
    hostingMode.addEventListener('change', syncHostingMode)
    syncHostingMode()
  }

  var dayLockTz = document.getElementById('DAY_LOCK_TIMEZONE')
  if (setupForm && dayLockTz) {
    try {
      var detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected) dayLockTz.value = detected
    } catch (e) {}
  }

  var wizardSteps = setupForm ? setupForm.querySelectorAll('.wizard-step') : []
  var wizardDots = document.getElementById('wizard-dots')
  var wizardStepName = document.getElementById('wizard-step-name')
  var currentStep = 0

  if (wizardDots) {
    wizardSteps.forEach(function () {
      var dot = document.createElement('span')
      dot.className = 'wizard-dot'
      wizardDots.appendChild(dot)
    })
  }

  function isVisible(el) {
    return el.offsetParent !== null
  }

  function buildRecap() {
    var recapEl = document.getElementById('recap-content')
    if (!recapEl) return
    recapEl.innerHTML = ''

    var previouslyHidden = []
    for (var i = 0; i < wizardSteps.length - 1; i++) {
      previouslyHidden.push(wizardSteps[i].hidden)
      wizardSteps[i].hidden = false
    }

    for (var j = 0; j < wizardSteps.length - 1; j++) {
      wizardSteps[j].querySelectorAll('.field.recap-key').forEach(function (fieldEl) {
        if (!isVisible(fieldEl)) return
        var label = fieldEl.querySelector('label')
        var input = fieldEl.querySelector('input, select')
        if (!label || !input) return
        var value
        if (input.type === 'checkbox') {
          value = input.checked ? 'Yes' : 'No'
        } else {
          value = input.value !== '' ? input.value : '(empty)'
        }
        var row = document.createElement('div')
        row.className = 'recap-row'
        var labelSpan = document.createElement('span')
        labelSpan.className = 'recap-label'
        labelSpan.textContent = label.textContent
        var valueSpan = document.createElement('span')
        valueSpan.className = 'recap-value'
        valueSpan.textContent = value
        row.appendChild(labelSpan)
        row.appendChild(valueSpan)
        recapEl.appendChild(row)
      })
    }

    for (var k = 0; k < wizardSteps.length - 1; k++) {
      wizardSteps[k].hidden = previouslyHidden[k]
    }
  }

  function showStep(index) {
    wizardSteps.forEach(function (el, idx) {
      el.hidden = idx !== index
    })
    if (wizardDots) {
      wizardDots.querySelectorAll('.wizard-dot').forEach(function (dot, idx) {
        dot.classList.toggle('active', idx === index)
        dot.classList.toggle('done', idx < index)
      })
    }
    if (wizardStepName) {
      var heading = wizardSteps[index].querySelector('h2')
      wizardStepName.textContent = heading ? heading.textContent : ''
    }
    if (index === wizardSteps.length - 1) buildRecap()
    window.scrollTo(0, 0)
  }

  function validateStep(index) {
    var stepEl = wizardSteps[index]
    var inputs = stepEl.querySelectorAll('input, select')
    for (var i = 0; i < inputs.length; i++) {
      if (!isVisible(inputs[i])) continue
      if (!inputs[i].checkValidity()) {
        inputs[i].reportValidity()
        return false
      }
    }
    if (stepEl.querySelector('#confirm_password') && !passwordsMatch()) return false
    return true
  }

  if (wizardSteps.length) {
    setupForm.querySelectorAll('.wizard-next').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!validateStep(currentStep)) return
        currentStep++
        showStep(currentStep)
      })
    })
    setupForm.querySelectorAll('.wizard-back').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentStep--
        showStep(currentStep)
      })
    })
    setupForm.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && currentStep < wizardSteps.length - 1) {
        event.preventDefault()
        var nextBtn = wizardSteps[currentStep].querySelector('.wizard-next')
        if (nextBtn) nextBtn.click()
      }
    })
    showStep(0)
  }

  if (setupForm && !wizardSteps.length) {
    setupForm.addEventListener('submit', function (event) {
      if (!passwordsMatch()) event.preventDefault()
    })
  }

  var regenerateForm = document.getElementById('regenerate-form')

  document.querySelectorAll('.regenerate').forEach(function (button) {
    button.addEventListener('click', function () {
      var field = button.getAttribute('data-field')
      var label = button.getAttribute('data-label') || field
      if (!regenerateForm) return
      if (!window.confirm('Regenerate ' + label + '? This will restart the backend.')) return
      regenerateForm.action = '/settings/regenerate/' + encodeURIComponent(field)
      regenerateForm.submit()
    })
  })
})
