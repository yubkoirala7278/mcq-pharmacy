/* MCQ practice exam — static front-end over the numbered set files (1.json, 2.json, …).
   New sets are picked up automatically: drop 6.json next to index.html and reload. */

(function () {
  'use strict';

  var MAX_SET = 100;        // highest set number ever probed
  var MISS_TOLERANCE = 3;   // stop after this many consecutive missing files

  var state = {
    sets: [],        // [{ n, file, data }]
    set: null,       // the set being attempted
    quiz: [],        // shuffled questions for this attempt
    answers: {},     // quizIndex -> chosen original option key
    startedAt: 0,
    elapsed: 0,
    timerId: null,
    result: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- helpers ---------------- */

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec);
  }

  function show(screen) {
    ['screen-home', 'screen-exam', 'screen-result'].forEach(function (id) {
      $(id).hidden = (id !== screen);
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- set discovery ---------------- */

  function validate(data, file) {
    if (!data || !Array.isArray(data.questions) || !data.questions.length) {
      throw new Error(file + ': missing a non-empty "questions" array');
    }
    data.questions.forEach(function (q, i) {
      if (!q.question || !q.options || !q.correct_answer) {
        throw new Error(file + ': question ' + (q.id || i + 1) + ' is missing question/options/correct_answer');
      }
      if (!(q.correct_answer in q.options)) {
        throw new Error(file + ': question ' + (q.id || i + 1) + ' has correct_answer "' + q.correct_answer + '" which is not one of its options');
      }
    });
    return data;
  }

  function loadSet(n) {
    var file = n + '.json';
    return fetch(file, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return data ? { n: n, file: file, data: validate(data, file) } : null; })
      .catch(function (err) {
        if (err instanceof SyntaxError) throw new Error(file + ': invalid JSON — ' + err.message);
        if (err.message && err.message.indexOf('.json:') > -1) throw err;
        return null; // network/404 — treat as "no such set"
      });
  }

  function discoverSets() {
    var found = [];
    var misses = 0;
    var n = 1;
    function step() {
      if (n > MAX_SET || misses >= MISS_TOLERANCE) return found;
      return loadSet(n).then(function (set) {
        if (set) { found.push(set); misses = 0; } else { misses++; }
        n++;
        return step();
      });
    }
    return Promise.resolve().then(step);
  }

  /* ---------------- home ---------------- */

  function renderHome() {
    var list = $('set-list');
    list.textContent = '';
    state.sets.forEach(function (set) {
      var d = set.data;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'set-card';

      var no = document.createElement('span');
      no.className = 'set-no';
      no.textContent = 'Set ' + set.n;

      var title = document.createElement('span');
      title.className = 'set-title';
      title.textContent = d.title || ('Question Set ' + set.n);

      var meta = document.createElement('span');
      meta.className = 'set-meta';
      var marks = d.total_marks != null
        ? d.total_marks
        : d.questions.length * (d.marks_per_question || 1);
      meta.textContent = d.questions.length + ' questions · ' + marks + ' marks';

      card.appendChild(no);
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener('click', function () { startExam(set); });
      list.appendChild(card);
    });
    $('home-opts').hidden = false;
  }

  /* ---------------- exam ---------------- */

  function buildQuiz(set) {
    var shuffleQ = $('opt-shuffle-q').checked;
    var shuffleO = $('opt-shuffle-o').checked;
    var source = shuffleQ ? shuffle(set.data.questions) : set.data.questions.slice();

    return source.map(function (q) {
      var entries = Object.keys(q.options).map(function (k) {
        return { key: k, text: q.options[k] };
      });
      return {
        origId: q.id,
        text: q.question,
        options: shuffleO ? shuffle(entries) : entries,
        correct: q.correct_answer
      };
    });
  }

  function startExam(set) {
    state.set = set;
    state.quiz = buildQuiz(set);
    state.answers = {};
    state.startedAt = Date.now();
    state.elapsed = 0;

    $('exam-title').textContent = set.data.title || ('Set ' + set.n);
    renderQuestions();
    updateProgress();

    var showTimer = $('opt-timer').checked;
    $('timer').hidden = !showTimer;
    clearInterval(state.timerId);
    if (showTimer) {
      $('timer').textContent = '00:00';
      state.timerId = setInterval(function () {
        $('timer').textContent = fmtTime(Date.now() - state.startedAt);
      }, 1000);
    }

    show('screen-exam');
  }

  // letters shown to the student, reassigned by display position
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  function questionCard(q, index, review) {
    var card = document.createElement('article');
    card.className = 'q-card';
    card.id = 'q-' + index;

    var head = document.createElement('div');
    head.className = 'q-head';
    var no = document.createElement('span');
    no.className = 'q-no';
    no.textContent = 'Q' + (index + 1);
    var text = document.createElement('h2');
    text.className = 'q-text';
    text.textContent = q.text;
    head.appendChild(no);
    head.appendChild(text);
    card.appendChild(head);

    var opts = document.createElement('div');
    opts.className = 'opts';
    opts.setAttribute('role', 'radiogroup');
    opts.setAttribute('aria-label', 'Question ' + (index + 1));

    var picked = state.answers[index];

    q.options.forEach(function (opt, pos) {
      var label = document.createElement('label');
      label.className = 'opt';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'q' + index;
      input.value = opt.key;
      input.checked = picked === opt.key;

      var key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = LETTERS[pos] + '.';

      var body = document.createElement('span');
      body.className = 'opt-text';
      body.textContent = opt.text;

      label.appendChild(input);
      label.appendChild(key);
      label.appendChild(body);

      if (review) {
        input.disabled = true;
        var tag = document.createElement('span');
        tag.className = 'tag';
        if (opt.key === q.correct) {
          label.classList.add('is-correct');
          tag.textContent = 'Correct answer';
          label.appendChild(tag);
        } else if (opt.key === picked) {
          label.classList.add('is-wrong');
          tag.textContent = 'Your answer';
          label.appendChild(tag);
        }
      } else {
        if (input.checked) label.classList.add('is-picked');
        input.addEventListener('change', function () {
          state.answers[index] = opt.key;
          card.classList.remove('is-flagged');
          Array.prototype.forEach.call(opts.children, function (el) {
            el.classList.toggle('is-picked', el === label);
          });
          updateProgress();
        });
      }

      opts.appendChild(label);
    });

    card.appendChild(opts);

    if (review) {
      var ok = picked === q.correct;
      card.classList.add(ok ? 'rev-correct' : 'rev-wrong');
      var note = document.createElement('p');
      note.className = 'rev-note ' + (ok ? 'good' : 'bad');
      note.textContent = ok
        ? 'Correct'
        : (picked ? 'Incorrect — you chose the wrong option.' : 'Not answered.');
      card.appendChild(note);
    }

    return card;
  }

  function renderQuestions() {
    var list = $('question-list');
    list.textContent = '';
    var frag = document.createDocumentFragment();
    state.quiz.forEach(function (q, i) { frag.appendChild(questionCard(q, i, false)); });
    list.appendChild(frag);
  }

  function firstUnanswered() {
    for (var i = 0; i < state.quiz.length; i++) {
      if (state.answers[i] == null) return i;
    }
    return -1;
  }

  function updateProgress() {
    var total = state.quiz.length;
    var done = Object.keys(state.answers).length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    $('progress-fill').style.width = pct + '%';
    $('progress-bar').setAttribute('aria-valuenow', String(pct));
    $('progress-text').textContent = done + ' of ' + total + ' answered';

    var left = total - done;
    $('btn-jump').hidden = left === 0;
    $('btn-submit').disabled = left > 0;
    $('submit-hint').textContent = left > 0
      ? 'Answer all questions to unlock submission — ' + left + ' left.'
      : 'All questions answered. Submit to see your score.';
  }

  function jumpToUnanswered() {
    var i = firstUnanswered();
    if (i < 0) return;
    var card = $('q-' + i);
    card.classList.add('is-flagged');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function quitExam() {
    if (Object.keys(state.answers).length &&
        !window.confirm('Leave this attempt? Your answers will be lost.')) return;
    clearInterval(state.timerId);
    show('screen-home');
  }

  /* ---------------- results ---------------- */

  function submitExam() {
    if (firstUnanswered() >= 0) return;
    clearInterval(state.timerId);
    state.elapsed = Date.now() - state.startedAt;

    var correct = 0;
    state.quiz.forEach(function (q, i) { if (state.answers[i] === q.correct) correct++; });

    var total = state.quiz.length;
    var perMark = state.set.data.marks_per_question || 1;
    state.result = {
      correct: correct,
      wrong: total - correct,
      total: total,
      pct: Math.round((correct / total) * 100),
      marks: correct * perMark,
      maxMarks: state.set.data.total_marks != null ? state.set.data.total_marks : total * perMark
    };

    renderResult();
    show('screen-result');
  }

  function verdict(pct) {
    if (pct >= 90) return 'Outstanding — exam ready.';
    if (pct >= 75) return 'Strong result. Polish the few misses below.';
    if (pct >= 50) return 'Passing range. Review your mistakes carefully.';
    return 'Needs more revision. Work through every mistake below.';
  }

  function renderResult() {
    var r = state.result;
    $('result-set').textContent = state.set.data.title || ('Set ' + state.set.n);
    $('score-ring').style.setProperty('--pct', r.pct);
    $('score-pct').textContent = r.pct + '%';
    $('score-frac').textContent = r.correct + ' / ' + r.total;
    $('result-verdict').textContent = verdict(r.pct);
    $('stat-correct').textContent = r.correct;
    $('stat-wrong').textContent = r.wrong;
    $('stat-marks').textContent = r.marks + ' / ' + r.maxMarks;
    $('stat-time').textContent = fmtTime(state.elapsed);

    setFilter('all');
  }

  function setFilter(kind) {
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
      chip.classList.toggle('is-active', chip.dataset.filter === kind);
    });

    var list = $('review-list');
    list.textContent = '';
    var frag = document.createDocumentFragment();
    var shown = 0;

    state.quiz.forEach(function (q, i) {
      var ok = state.answers[i] === q.correct;
      if (kind === 'correct' && !ok) return;
      if (kind === 'wrong' && ok) return;
      frag.appendChild(questionCard(q, i, true));
      shown++;
    });

    if (!shown) {
      var empty = document.createElement('p');
      empty.className = 'notice';
      empty.textContent = kind === 'wrong'
        ? 'No mistakes — you answered every question correctly.'
        : 'Nothing to show here.';
      frag.appendChild(empty);
    }
    list.appendChild(frag);
  }

  /* ---------------- boot ---------------- */

  function fail(message, hint) {
    $('loading').hidden = true;
    var box = $('load-error');
    box.hidden = false;
    box.textContent = message;
    if (hint) {
      var code = document.createElement('code');
      code.textContent = hint;
      box.appendChild(code);
    }
  }

  function init() {
    $('btn-submit').addEventListener('click', submitExam);
    $('btn-jump').addEventListener('click', jumpToUnanswered);
    $('btn-quit').addEventListener('click', quitExam);
    $('btn-retry').addEventListener('click', function () { startExam(state.set); });
    $('btn-home').addEventListener('click', function () { show('screen-home'); });
    $('btn-home-2').addEventListener('click', function () { show('screen-home'); });
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
      chip.addEventListener('click', function () { setFilter(chip.dataset.filter); });
    });
    window.addEventListener('beforeunload', function (e) {
      if (!$('screen-exam').hidden && Object.keys(state.answers).length) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    if (location.protocol === 'file:') {
      fail('This page must be served over HTTP so it can read the question files. ' +
           'Open a terminal in this folder and run the bundled server, then visit http://localhost:8000',
           'powershell -ExecutionPolicy Bypass -File serve.ps1');
      return;
    }

    discoverSets().then(function (sets) {
      $('loading').hidden = true;
      if (!sets.length) {
        fail('No question sets found. Expected 1.json, 2.json, … next to index.html.');
        return;
      }
      state.sets = sets;
      renderHome();
    }).catch(function (err) {
      fail('Could not load question sets. ' + err.message);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
