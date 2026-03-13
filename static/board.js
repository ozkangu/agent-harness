// Maestro Kanban Board - Vanilla JS SPA

// --- Theme Toggle ---
(function initTheme() {
    const saved = localStorage.getItem('maestro-theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', next);
    }
    localStorage.setItem('maestro-theme', next);
    updateThemeButton();
}

function updateThemeButton() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme');
    btn.innerHTML = current === 'light' ? '&#9790;' : '&#9789;';
    btn.title = current === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

// --- Backend Selector ---

async function loadBackendConfig() {
    try {
        const res = await fetch(`${API}/config/backend`);
        const data = await res.json();
        const select = document.getElementById('backend-select');
        if (select && data.backend) {
            select.value = data.backend;
        }
    } catch {
        // API not available yet
    }
}

async function changeBackend() {
    const select = document.getElementById('backend-select');
    const backend = select.value;
    try {
        await fetch(`${API}/config/backend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backend }),
        });
        showToast(`Backend changed to: ${backend.toUpperCase()}`);
    } catch (err) {
        showToast('Failed to change backend');
    }
}

const API = '/api';
let ws = null;
let reconnectTimer = null;

// Valid status transitions (must match backend)
const VALID_TRANSITIONS = {
    'todo': ['working'],
    'working': ['review', 'failed', 'todo'],
    'review': ['done', 'todo'],
    'failed': ['todo'],
    'done': [],
};

// --- API Calls ---

async function fetchIssues() {
    const res = await fetch(`${API}/issues`);
    return res.json();
}

async function fetchIssue(key) {
    const res = await fetch(`${API}/issues/${key}`);
    return res.json();
}

async function fetchStats() {
    const res = await fetch(`${API}/stats`);
    return res.json();
}

async function apiCreateIssue(data) {
    const res = await fetch(`${API}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function apiUpdateIssue(key, data) {
    const res = await fetch(`${API}/issues/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Update failed');
    }
    return res.json();
}

// --- Board Rendering ---

function renderCard(issue) {
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.dataset.key = issue.key;

    const attemptText = issue.attempt_count > 0
        ? `<span class="attempt-badge">attempt ${issue.attempt_count}</span>`
        : '';

    const pipelineBadge = issue.pipeline_id
        ? `<span class="pipeline-badge">P-${issue.pipeline_id}</span>`
        : '';

    card.innerHTML = `
        <div class="card-key">${issue.key}${pipelineBadge}</div>
        <div class="card-title">${escapeHtml(issue.title)}</div>
        <div class="card-meta">
            <span class="priority-badge priority-${issue.priority}">${issue.priority}</span>
            ${attemptText}
        </div>
    `;

    // Drag events
    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', issue.key);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
    });

    // Click to show detail
    card.addEventListener('click', () => showDetail(issue.key));

    return card;
}

async function renderBoard() {
    const issues = await fetchIssues();
    const columns = ['todo', 'working', 'review', 'done', 'failed'];

    for (const status of columns) {
        const col = document.getElementById(`col-${status}`);
        col.innerHTML = '';
        const statusIssues = issues.filter(i => i.status === status);
        for (const issue of statusIssues) {
            col.appendChild(renderCard(issue));
        }
        document.getElementById(`count-${status}`).textContent = statusIssues.length;
    }

    updateStats();
}

async function updateStats() {
    const stats = await fetchStats();
    for (const [status, count] of Object.entries(stats)) {
        const el = document.getElementById(`stat-${status}`);
        if (el) el.textContent = count;
    }
}

// --- Drag & Drop ---

function setupDragDrop() {
    const columns = document.querySelectorAll('.column-body');

    for (const col of columns) {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            col.classList.add('drag-over');
        });

        col.addEventListener('dragleave', () => {
            col.classList.remove('drag-over');
        });

        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');

            const key = e.dataTransfer.getData('text/plain');
            const targetStatus = col.dataset.status;

            // Find current status
            const card = document.querySelector(`.card[data-key="${key}"]`);
            if (!card) return;
            const currentCol = card.closest('.column-body');
            const currentStatus = currentCol.dataset.status;

            if (currentStatus === targetStatus) return;

            // Validate transition
            const allowed = VALID_TRANSITIONS[currentStatus] || [];
            if (!allowed.includes(targetStatus)) {
                showToast(`Cannot move from ${currentStatus} to ${targetStatus}`);
                return;
            }

            try {
                await apiUpdateIssue(key, { status: targetStatus });
                await renderBoard();
            } catch (err) {
                showToast(err.message);
            }
        });
    }
}

// --- Create Issue ---

function openCreateModal() {
    document.getElementById('create-modal').classList.add('active');
    document.getElementById('issue-title').focus();
}

function closeCreateModal() {
    document.getElementById('create-modal').classList.remove('active');
    document.getElementById('create-form').reset();
}

async function createIssue(e) {
    e.preventDefault();

    const title = document.getElementById('issue-title').value.trim();
    const description = document.getElementById('issue-description').value.trim();
    const priority = document.getElementById('issue-priority').value;
    const labelsRaw = document.getElementById('issue-labels').value.trim();
    const labels = labelsRaw ? labelsRaw.split(',').map(l => l.trim()).filter(Boolean) : [];

    await apiCreateIssue({ title, description, priority, labels });
    closeCreateModal();
    await renderBoard();
    return false;
}

// --- Detail Panel ---

async function showDetail(key) {
    const data = await fetchIssue(key);
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('detail-body');

    document.getElementById('detail-key').textContent = `${data.key} - ${data.title}`;

    let html = `
        <div class="field"><span class="field-label">Status:</span> ${data.status}</div>
        <div class="field"><span class="field-label">Priority:</span> ${data.priority}</div>
        <div class="field"><span class="field-label">Labels:</span> ${data.labels.join(', ') || 'none'}</div>
        <div class="field"><span class="field-label">Attempts:</span> ${data.attempt_count}</div>
    `;

    if (data.story_id) {
        html += `<div class="field"><span class="field-label">Story ID:</span> ${escapeHtml(data.story_id)}</div>`;
    }
    if (data.depends_on && data.depends_on.length) {
        html += `<div class="field"><span class="field-label">Depends On:</span> ${escapeHtml(data.depends_on.join(', '))}</div>`;
    }
    if (data.blocked_reason) {
        html += `<div class="field"><span class="field-label">Blocked:</span> ${escapeHtml(data.blocked_reason)}</div>`;
    }

    if (data.branch_name) {
        html += `<div class="field"><span class="field-label">Branch:</span> ${escapeHtml(data.branch_name)}</div>`;
    }
    if (data.pr_url) {
        html += `<div class="field"><span class="field-label">PR:</span> <a href="${escapeHtml(data.pr_url)}" target="_blank" style="color:var(--accent)">${escapeHtml(data.pr_url)}</a></div>`;
    }

    html += `<h3>Description</h3><div class="field">${escapeHtml(data.description) || '<em>No description</em>'}</div>`;

    if (data.error_log) {
        html += `<h3>Error Log</h3><div class="error-log">${escapeHtml(data.error_log)}</div>`;
    }

    if (data.activity && data.activity.length) {
        html += `<h3>Activity Log</h3><ul class="activity-list">`;
        for (const a of data.activity.reverse()) {
            const ts = new Date(a.timestamp).toLocaleTimeString();
            html += `<li><span class="event-type">${escapeHtml(a.event)}</span> ${escapeHtml(a.details)} <span class="timestamp">${ts}</span></li>`;
        }
        html += `</ul>`;
    }

    body.innerHTML = html;
    panel.classList.add('active');
}

function closeDetail() {
    document.getElementById('detail-panel').classList.remove('active');
}

// --- WebSocket ---

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
        const indicator = document.getElementById('ws-status');
        indicator.className = 'connection-status connected';
        indicator.title = 'WebSocket connected';
        stopBoardPolling();
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (['issue_created', 'issue_updated', 'issue_deleted'].includes(msg.event)) {
            renderBoard();
        }
        // Real-time terminal output
        if (msg.event === 'runner_output' && msg.data) {
            appendTerminalLine(msg.data);
        }
        // Forward to chat handler if available
        if (typeof handleChatWsEvent === 'function') {
            handleChatWsEvent(msg);
        }
    };

    ws.onclose = () => {
        const indicator = document.getElementById('ws-status');
        indicator.className = 'connection-status disconnected';
        indicator.title = 'WebSocket disconnected';
        startBoardPolling();
        // Reconnect after 3s
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectWebSocket();
            }, 3000);
        }
    };

    ws.onerror = () => {
        ws.close();
    };
}

// Periodic poll as fallback — only when WebSocket is disconnected
let boardPollTimer = null;

function startBoardPolling() {
    if (!boardPollTimer) {
        boardPollTimer = setInterval(() => renderBoard(), 10000);
    }
}

function stopBoardPolling() {
    if (boardPollTimer) {
        clearInterval(boardPollTimer);
        boardPollTimer = null;
    }
}

// --- Board Tab Switching ---

function switchBoardTab(tabName) {
    // Toggle tab buttons
    document.querySelectorAll('.board-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Toggle tab content panels
    document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    // Load artifacts when switching to that tab
    if (tabName === 'artifacts' && typeof refreshArtifactsPanel === 'function') {
        refreshArtifactsPanel();
    }
    if (tabName === 'quality') {
        renderQualityPanel();
    }
    if (tabName === 'context') {
        renderContextPanel();
    }
}

// --- Quality Panel ---

async function renderQualityPanel() {
    const panel = document.getElementById('quality-panel');
    if (!panel) return;

    try {
        const res = await fetch(`${API}/quality/runs?limit=20`);
        if (!res.ok) {
            panel.innerHTML = '<div class="chat-empty">Quality gate not configured.</div>';
            return;
        }
        const runs = await res.json();

        if (!runs.length) {
            panel.innerHTML = '<div class="chat-empty">No quality runs yet.</div>';
            return;
        }

        let html = '<div class="artifact-section-title">Quality Runs</div>';
        for (const run of runs) {
            const statusClass = run.status === 'pass' ? 'pass' : 'fail';
            const time = new Date(run.created_at).toLocaleString();
            html += `
                <div class="quality-run-card">
                    <div class="run-header">
                        <span class="run-type">${escapeHtml(run.run_type)}</span>
                        <span class="run-status ${statusClass}">${escapeHtml(run.status.toUpperCase())}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-secondary)">
                        ${run.issue_key ? `Issue: ${escapeHtml(run.issue_key)} | ` : ''}
                        Triggered by: ${escapeHtml(run.triggered_by)} | ${time}
                    </div>
                    ${run.output ? `<div class="run-output">${escapeHtml(run.output.substring(0, 500))}</div>` : ''}
                </div>
            `;
        }
        panel.innerHTML = html;
    } catch {
        panel.innerHTML = '<div class="chat-empty">Failed to load quality data.</div>';
    }
}

// --- Context Panel ---

async function renderContextPanel() {
    const panel = document.getElementById('context-panel');
    if (!panel) return;

    try {
        const res = await fetch(`${API}/context/agents-md`);
        if (!res.ok) {
            panel.innerHTML = '<div class="chat-empty">Context engine not configured.</div>';
            return;
        }
        const files = await res.json();

        let html = '<div class="artifact-section-title">AGENTS.md Files</div>';

        if (!files.length) {
            html += '<div class="chat-empty">No AGENTS.md files found in the repository.</div>';
        } else {
            for (const f of files) {
                html += `
                    <div class="context-file-card" onclick="showContextFile('${escapeHtml(f.path)}')">
                        <div class="file-path">${escapeHtml(f.path)}</div>
                        <div class="file-type">Type: ${escapeHtml(f.doc_type || 'agents_md')}</div>
                    </div>
                `;
            }
        }

        // Repo map button
        html += `
            <div style="margin-top:16px">
                <button class="btn btn-primary" onclick="showRepoMap()">Show Repo Map</button>
                <button class="btn" onclick="refreshContext()" style="margin-left:8px">Refresh Cache</button>
            </div>
        `;

        html += '<div id="context-content-area"></div>';
        panel.innerHTML = html;
    } catch {
        panel.innerHTML = '<div class="chat-empty">Failed to load context data.</div>';
    }
}

async function showContextFile(path) {
    const area = document.getElementById('context-content-area');
    if (!area) return;
    // Fetch full agents-md list and find the matching one
    try {
        const res = await fetch(`${API}/context/agents-md`);
        const files = await res.json();
        const file = files.find(f => f.path === path);
        if (file && file.content) {
            area.innerHTML = `<div class="context-content">${escapeHtml(file.content)}</div>`;
        } else {
            area.innerHTML = '<div class="chat-empty">Content not available.</div>';
        }
    } catch {
        area.innerHTML = '<div class="chat-empty">Failed to load file.</div>';
    }
}

async function showRepoMap() {
    const area = document.getElementById('context-content-area');
    if (!area) return;
    try {
        const res = await fetch(`${API}/context/repo-map`);
        const data = await res.json();
        area.innerHTML = `<div class="context-content">${escapeHtml(data.repo_map || 'No repo map available.')}</div>`;
    } catch {
        area.innerHTML = '<div class="chat-empty">Failed to load repo map.</div>';
    }
}

async function refreshContext() {
    try {
        await fetch(`${API}/context/refresh`, { method: 'POST' });
        showToast('Context cache refreshed');
        renderContextPanel();
    } catch {
        showToast('Failed to refresh context');
    }
}

// --- Artifacts Viewer ---

let currentArtifactKey = null;

async function refreshArtifactsPanel() {
    if (!currentPipelineId) {
        document.getElementById('artifacts-nav').innerHTML =
            '<div class="chat-empty">Select a pipeline to view artifacts.</div>';
        document.getElementById('artifact-viewer').innerHTML =
            '<div class="chat-empty">Select an artifact from the sidebar.</div>';
        return;
    }
    try {
        const res = await fetch(`${API}/pipelines/${currentPipelineId}/artifacts`);
        if (!res.ok) return;
        const data = await res.json();
        renderArtifactsSidebar(data);
        if (currentArtifactKey) {
            showArtifact(currentArtifactKey, data);
        }
    } catch (e) {
        // API may not be ready
    }
}

function renderArtifactsSidebar(data) {
    const nav = document.getElementById('artifacts-nav');
    const items = [
        { key: 'repo_context', label: 'Repo Context', available: !!data.repo_context },
        { key: 'clarification', label: 'Clarifications', available: !!(data.clarification_questions_json || data.clarification_answers_json) },
        { key: 'analysis', label: 'Analysis Doc', available: !!data.analysis_doc },
        { key: 'stories', label: 'Stories', available: !!data.stories_json },
        { key: 'review', label: 'Code Review', available: !!data.review_report },
        { key: 'test', label: 'Test Validation', available: !!data.test_report },
    ];

    nav.innerHTML = items.map(item => `
        <div class="artifact-nav-item${currentArtifactKey === item.key ? ' active' : ''}"
             onclick="showArtifact('${item.key}')">
            <span class="status-dot ${item.available ? 'available' : 'unavailable'}"></span>
            ${escapeHtml(item.label)}
        </div>
    `).join('');
}

function showArtifact(key, cachedData) {
    currentArtifactKey = key;
    // Update sidebar active state
    document.querySelectorAll('.artifact-nav-item').forEach(el => {
        el.classList.toggle('active', el.textContent.trim() === {
            'repo_context': 'Repo Context',
            'clarification': 'Clarifications',
            'analysis': 'Analysis Doc',
            'stories': 'Stories',
            'review': 'Code Review',
            'test': 'Test Validation',
        }[key]);
    });

    if (cachedData) {
        _renderArtifactContent(key, cachedData);
    } else if (currentPipelineId) {
        fetch(`${API}/pipelines/${currentPipelineId}/artifacts`)
            .then(r => r.json())
            .then(data => {
                renderArtifactsSidebar(data);
                _renderArtifactContent(key, data);
            });
    }
}

function _renderArtifactContent(key, data) {
    const viewer = document.getElementById('artifact-viewer');

    switch (key) {
        case 'repo_context':
            renderRepoContext(viewer, data.repo_context);
            break;
        case 'clarification':
            renderClarificationArtifact(
                viewer,
                data.clarification_questions_json,
                data.clarification_answers_json
            );
            break;
        case 'analysis':
            renderAnalysisArtifact(viewer, data.analysis_doc);
            break;
        case 'stories':
            renderStoriesArtifact(viewer, data.stories_parsed, data.stories_json);
            break;
        case 'review':
            renderReportArtifact(viewer, 'Code Review', data.review_report, data.review_verdict);
            break;
        case 'test':
            renderReportArtifact(viewer, 'Test Validation', data.test_report, data.test_verdict);
            break;
        default:
            viewer.innerHTML = '<div class="chat-empty">Unknown artifact.</div>';
    }
}

function renderRepoContext(viewer, content) {
    if (!content) {
        viewer.innerHTML = '<div class="chat-empty">Repo context not yet available.</div>';
        return;
    }
    viewer.innerHTML = `
        <div class="artifact-section-title">Repository Context</div>
        <pre class="artifact-raw">${escapeHtml(content)}</pre>
    `;
}

function renderStoriesArtifact(viewer, parsed, raw) {
    if (!parsed && !raw) {
        viewer.innerHTML = '<div class="chat-empty">Stories not yet generated.</div>';
        return;
    }

    let html = '<div class="artifact-section-title">Implementation Stories</div>';

    if (parsed && parsed.length > 0) {
        for (let i = 0; i < parsed.length; i++) {
            const s = parsed[i];
            const labels = (s.labels || []).map(l =>
                `<span class="story-label">${escapeHtml(l)}</span>`
            ).join('');
            html += `
                <div class="artifact-story-card">
                    <div class="story-title">Story ${i + 1}: ${escapeHtml(s.title || 'Untitled')}</div>
                    <div class="story-desc">${escapeHtml(s.description || '')}</div>
                    <div class="story-meta">
                        <span class="priority-badge priority-${s.priority || 'medium'}">${escapeHtml(s.priority || 'medium')}</span>
                        ${labels}
                    </div>
                    <div class="story-desc"><strong>Parallelizable:</strong> ${s.parallelizable === false ? 'No' : 'Yes'}</div>
                    <div class="story-desc"><strong>Depends on:</strong> ${escapeHtml((s.depends_on || []).join(', ') || 'none')}</div>
                </div>
            `;
        }
    } else if (raw) {
        html += `<pre class="artifact-raw">${escapeHtml(raw)}</pre>`;
    }

    viewer.innerHTML = html;
}

function renderClarificationArtifact(viewer, questionsRaw, answersRaw) {
    const questions = safeJsonParseArray(questionsRaw);
    const answers = safeJsonParseArray(answersRaw);

    if (!questions.length && !answers.length) {
        viewer.innerHTML = '<div class="chat-empty">Clarification data not yet available.</div>';
        return;
    }

    let html = '<div class="artifact-section-title">Clarifications</div>';

    if (questions.length) {
        html += '<h3>Questions</h3>';
        html += questions.map(q => `
            <div class="artifact-story-card">
                <div class="story-title">${escapeHtml(q.id || 'Q?')}: ${escapeHtml(q.question || '')}</div>
                <div class="story-desc">${escapeHtml(q.rationale || '')}</div>
            </div>
        `).join('');
    }

    if (answers.length) {
        html += '<h3>Answers</h3><pre class="artifact-raw">';
        html += escapeHtml(answers.map((a, idx) => `${idx + 1}. ${a.answer || ''}`).join('\n'));
        html += '</pre>';
    }

    viewer.innerHTML = html;
}

function renderAnalysisArtifact(viewer, content) {
    if (!content) {
        viewer.innerHTML = '<div class="chat-empty">Analysis document not yet available.</div>';
        return;
    }
    viewer.innerHTML = `
        <div class="artifact-section-title">Analysis Document</div>
        <pre class="artifact-raw">${escapeHtml(content)}</pre>
    `;
}

function safeJsonParseArray(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function renderReportArtifact(viewer, title, content, verdict) {
    if (!content && !verdict) {
        viewer.innerHTML = `<div class="chat-empty">${escapeHtml(title)} not yet available.</div>`;
        return;
    }

    let html = `<div class="artifact-section-title">${escapeHtml(title)}</div>`;

    if (verdict) {
        const vclass = verdict.verdict === 'PASS' ? 'verdict-pass' : 'verdict-fail';
        const bclass = verdict.verdict === 'PASS' ? 'pass' : 'fail';
        html += `
            <div class="verdict-block ${vclass}">
                <span class="verdict-badge ${bclass}">${escapeHtml(verdict.verdict)}</span>
                <div class="verdict-score">Score: ${verdict.score ?? 'N/A'}</div>
                ${verdict.summary ? `<div style="font-size:12px;margin-bottom:6px">${escapeHtml(verdict.summary)}</div>` : ''}
                ${verdict.issues && verdict.issues.length > 0 ? `
                    <ul class="verdict-issues">
                        ${verdict.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `;
    }

    if (content) {
        html += `<pre class="artifact-raw">${escapeHtml(content)}</pre>`;
    }

    viewer.innerHTML = html;
}

// --- Real-Time Terminal ---

const TERMINAL_MAX_LINES = 1000;

function appendTerminalLine(data) {
    const output = document.getElementById('terminal-output');
    if (!output) return;

    // Clear placeholder
    const empty = output.querySelector('.chat-empty');
    if (empty) empty.remove();

    const line = document.createElement('div');
    line.className = 'terminal-line';

    const type = data.type || 'raw';
    line.classList.add(`type-${type}`);

    const displayContent = _extractDisplayContent(data);
    const prefix = data.issue_key ? `[${data.issue_key}] ` : '';
    line.innerHTML = `<span class="line-prefix">${escapeHtml(prefix)}</span>${escapeHtml(displayContent)}`;

    output.appendChild(line);

    // Trim old lines
    while (output.children.length > TERMINAL_MAX_LINES) {
        output.removeChild(output.firstChild);
    }

    // Auto-scroll
    output.scrollTop = output.scrollHeight;
}

function _extractDisplayContent(parsed) {
    if (parsed.content) return parsed.content;
    if (parsed.type === 'assistant' && parsed.message) {
        return typeof parsed.message === 'string' ? parsed.message : (parsed.message.content || '');
    }
    if (parsed.type === 'result') return parsed.result || parsed.content || '';
    if (parsed.type === 'tool') return `[tool] ${parsed.name || ''}: ${parsed.content || ''}`;
    return JSON.stringify(parsed);
}

function clearTerminal() {
    const output = document.getElementById('terminal-output');
    if (output) {
        output.innerHTML = '<div class="chat-empty">Terminal cleared.</div>';
    }
}

// --- Utilities ---

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let toastTimer = null;
function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: var(--bg-tertiary); color: var(--red); border: 1px solid var(--border);
            padding: 10px 20px; border-radius: 8px; font-size: 13px; font-family: var(--font);
            z-index: 200; transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// Close modal/detail on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCreateModal();
        closeDetail();
    }
});

// Close modal on overlay click
document.getElementById('create-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateModal();
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    updateThemeButton();
    loadBackendConfig();
    setupDragDrop();
    renderBoard();
    connectWebSocket();
});
