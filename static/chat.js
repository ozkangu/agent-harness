// Maestro Chat Panel - Pipeline & Conversation Management

let currentPipelineId = null;
let currentConversationId = null;
let currentMode = 'chat';  // 'chat' or 'pipeline'
let chatPollTimer = null;
let autoApproveMode = true;

const PHASE_LABELS = {
    'repo_context': 'Phase 0: Repo Context',
    'clarification': 'Phase 1: Clarification Analysis',
    'awaiting_clarification': 'Awaiting: Clarification',
    'analysis_document': 'Phase 2: Analysis Document',
    'ba_analysis': 'Phase 3: Story Planning',
    'awaiting_approval_1': 'Awaiting: Story Review',
    'coding': 'Phase 4: Coding',
    'awaiting_approval_2': 'Awaiting: Code Complete',
    'code_review': 'Phase 3: Code Review',
    'awaiting_approval_3': 'Awaiting: Review Report',
    'test_validation': 'Phase 4: Test Validation',
    'awaiting_approval_4': 'Awaiting: Test Report',
    'done': 'Done',
    'failed': 'Failed',
};

const PHASE_ORDER = [
    'repo_context', 'clarification', 'awaiting_clarification',
    'analysis_document', 'ba_analysis', 'awaiting_approval_1',
    'coding', 'awaiting_approval_2', 'code_review',
    'awaiting_approval_3', 'test_validation', 'awaiting_approval_4', 'done'
];

// --- Pipeline API ---

async function apiGetPipelines() {
    const res = await fetch(`${API}/pipelines`);
    if (!res.ok) return [];
    return res.json();
}

async function apiCreatePipeline(requirement) {
    const res = await fetch(`${API}/pipelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement }),
    });
    return res.json();
}

async function apiGetPipeline(id) {
    const res = await fetch(`${API}/pipelines/${id}`);
    return res.json();
}

async function apiGetMessages(pipelineId) {
    const res = await fetch(`${API}/pipelines/${pipelineId}/messages`);
    if (!res.ok) return [];
    return res.json();
}

async function apiSendMessage(pipelineId, text) {
    const res = await fetch(`${API}/pipelines/${pipelineId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    return res.json();
}

async function apiApprovePipeline(pipelineId) {
    const res = await fetch(`${API}/pipelines/${pipelineId}/approve`, {
        method: 'POST',
    });
    return res.json();
}

async function apiRejectPipeline(pipelineId) {
    const res = await fetch(`${API}/pipelines/${pipelineId}/reject`, {
        method: 'POST',
    });
    return res.json();
}

async function apiGetAutoApprove() {
    try {
        const res = await fetch(`${API}/config/auto-approve`);
        const data = await res.json();
        return data.auto_approve;
    } catch {
        return true;
    }
}

async function apiSetAutoApprove(value) {
    const res = await fetch(`${API}/config/auto-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_approve: value }),
    });
    const data = await res.json();
    return data.auto_approve;
}

// --- Rendering ---

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;

    const time = new Date(msg.created_at).toLocaleTimeString();
    let content = escapeHtml(msg.content);

    // Simple markdown-like bold
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Highlight quality gate verdicts
    content = content.replace(/PASS/g, '<span class="verdict-pass">PASS</span>');
    content = content.replace(/FAIL/g, '<span class="verdict-fail">FAIL</span>');

    div.innerHTML = `${content}<div class="msg-time">${time}</div>`;
    return div;
}

function renderPhaseIndicator(phase) {
    const el = document.getElementById('phase-indicator');
    const label = PHASE_LABELS[phase] || phase;
    el.textContent = label;
    el.className = `phase-indicator phase-${phase}`;
}

function renderProgressBar(phase) {
    const bar = document.getElementById('pipeline-progress');
    if (!bar) return;

    const idx = PHASE_ORDER.indexOf(phase);
    const total = PHASE_ORDER.length;
    const pct = idx >= 0 ? Math.round(((idx + 1) / total) * 100) : 0;

    bar.innerHTML = `
        <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
        </div>
        <span class="progress-text">${pct}%</span>
    `;

    if (phase === 'done') {
        bar.classList.add('progress-done');
    } else if (phase === 'failed') {
        bar.classList.add('progress-failed');
    } else {
        bar.classList.remove('progress-done', 'progress-failed');
    }
}

function updateApprovalBar(phase) {
    const bar = document.getElementById('approval-bar');
    // Only show approval bar in manual mode during awaiting phases
    if (!autoApproveMode && phase && phase.startsWith('awaiting_')) {
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}

function updateAutoApproveIndicator() {
    const indicator = document.getElementById('auto-approve-indicator');
    if (!indicator) return;
    if (autoApproveMode) {
        indicator.className = 'auto-approve-indicator on';
        indicator.title = 'Auto-pilot: ON (click to toggle)';
        indicator.textContent = 'AUTO';
    } else {
        indicator.className = 'auto-approve-indicator off';
        indicator.title = 'Auto-pilot: OFF (click to toggle)';
        indicator.textContent = 'MANUAL';
    }
}

async function loadMessages(pipelineId) {
    const container = document.getElementById('chat-messages');
    const messages = await apiGetMessages(pipelineId);

    container.innerHTML = '';
    if (messages.length === 0) {
        container.innerHTML = '<div class="chat-empty">No messages yet.</div>';
        return;
    }

    for (const msg of messages) {
        container.appendChild(renderMessage(msg));
    }
    container.scrollTop = container.scrollHeight;
}

async function refreshPipelineState() {
    if (!currentPipelineId) return;

    try {
        const pipeline = await apiGetPipeline(currentPipelineId);
        renderPhaseIndicator(pipeline.phase);
        renderProgressBar(pipeline.phase);
        updateApprovalBar(pipeline.phase);
        await loadMessages(currentPipelineId);
    } catch (e) {
        // Pipeline may not exist yet
    }
}

// --- Pipeline selector ---

async function loadPipelineSelector() {
    const select = document.getElementById('pipeline-select');
    const pipelines = await apiGetPipelines();

    // Keep the first placeholder option
    select.innerHTML = '<option value="">-- Select Pipeline --</option>';
    for (const p of pipelines) {
        const opt = document.createElement('option');
        opt.value = p.id;
        const phaseShort = p.phase === 'done' ? ' [DONE]' :
                           p.phase === 'failed' ? ' [FAIL]' : '';
        opt.textContent = `P-${p.id}: ${p.name.substring(0, 35)}${phaseShort}`;
        if (p.id === currentPipelineId) opt.selected = true;
        select.appendChild(opt);
    }
}

function switchPipeline() {
    const select = document.getElementById('pipeline-select');
    const val = select.value;
    if (val) {
        currentPipelineId = parseInt(val, 10);
        refreshPipelineState();
        // Refresh artifacts if that tab is active
        const artifactsTab = document.getElementById('tab-artifacts');
        if (artifactsTab && artifactsTab.classList.contains('active') && typeof refreshArtifactsPanel === 'function') {
            refreshArtifactsPanel();
        }
    } else {
        currentPipelineId = null;
        document.getElementById('chat-messages').innerHTML =
            '<div class="chat-empty">Select or create a pipeline to start.</div>';
        document.getElementById('phase-indicator').textContent = 'No pipeline selected';
        document.getElementById('phase-indicator').className = 'phase-indicator';
        document.getElementById('approval-bar').style.display = 'none';
        const bar = document.getElementById('pipeline-progress');
        if (bar) bar.innerHTML = '';
    }
}

// --- Actions ---

function newPipeline() {
    document.getElementById('pipeline-modal').classList.add('active');
    document.getElementById('pipeline-requirement').focus();
}

function closePipelineModal() {
    document.getElementById('pipeline-modal').classList.remove('active');
    document.getElementById('pipeline-form').reset();
}

async function createPipeline(e) {
    e.preventDefault();
    const requirement = document.getElementById('pipeline-requirement').value.trim();
    if (!requirement) return false;

    const pipeline = await apiCreatePipeline(requirement);
    closePipelineModal();

    currentPipelineId = pipeline.id;
    await loadPipelineSelector();
    await refreshPipelineState();
    return false;
}

async function sendMessage() {
    if (currentMode === 'pipeline') {
        await sendPipelineMessage();
    } else {
        await sendChatMessage();
    }
}

async function sendPipelineMessage() {
    if (!currentPipelineId) {
        showToast('Select or create a pipeline first');
        return;
    }

    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    await apiSendMessage(currentPipelineId, text);
    await refreshPipelineState();
}

async function sendChatMessage(text) {
    const input = document.getElementById('chat-input');
    const msgText = text || input.value.trim();
    if (!msgText) return;

    input.value = '';

    if (!currentConversationId) {
        // Auto-create conversation
        try {
            const res = await fetch(`${API}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: msgText }),
            });
            const data = await res.json();
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
                await loadConversationSelector();
            }
            await loadConversationMessages();
        } catch (err) {
            showToast('Failed to send message');
        }
    } else {
        try {
            await fetch(`${API}/conversations/${currentConversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: msgText }),
            });
            await loadConversationMessages();
        } catch (err) {
            showToast('Failed to send message');
        }
    }
}

// --- Chat Mode Switching ---

function switchChatMode(mode) {
    currentMode = mode;

    // Toggle mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Toggle headers
    const chatHeader = document.getElementById('chat-mode-header');
    const pipelineHeader = document.getElementById('pipeline-mode-header');
    if (chatHeader) chatHeader.style.display = mode === 'chat' ? 'flex' : 'none';
    if (pipelineHeader) pipelineHeader.style.display = mode === 'pipeline' ? 'flex' : 'none';

    // Toggle pipeline-only elements
    document.querySelectorAll('.pipeline-mode-only').forEach(el => {
        el.style.display = mode === 'pipeline' ? '' : 'none';
    });

    // Toggle chat-only elements
    document.querySelectorAll('.chat-mode-only').forEach(el => {
        el.style.display = mode === 'chat' ? '' : 'none';
    });

    // Refresh content
    if (mode === 'chat') {
        if (currentConversationId) {
            loadConversationMessages();
        } else {
            const container = document.getElementById('chat-messages');
            container.innerHTML = '<div class="chat-empty">Select or start a new chat.</div>';
        }
    } else {
        if (currentPipelineId) {
            refreshPipelineState();
        } else {
            const container = document.getElementById('chat-messages');
            container.innerHTML = '<div class="chat-empty">Select or create a pipeline to start.</div>';
        }
    }
}

// --- Conversation Management ---

async function loadConversationSelector() {
    const select = document.getElementById('conversation-select');
    if (!select) return;

    try {
        const res = await fetch(`${API}/conversations`);
        if (!res.ok) return;
        const conversations = await res.json();

        select.innerHTML = '<option value="">-- Select Chat --</option>';
        for (const c of conversations) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `C-${c.id}: ${c.title.substring(0, 35)}`;
            if (c.id === currentConversationId) opt.selected = true;
            select.appendChild(opt);
        }
    } catch {
        // API not ready
    }
}

function switchConversation() {
    const select = document.getElementById('conversation-select');
    const val = select.value;
    if (val) {
        currentConversationId = parseInt(val, 10);
        loadConversationMessages();
    } else {
        currentConversationId = null;
        document.getElementById('chat-messages').innerHTML =
            '<div class="chat-empty">Select or start a new chat.</div>';
    }
}

async function newConversation() {
    try {
        const res = await fetch(`${API}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' }),
        });
        const conv = await res.json();
        currentConversationId = conv.id;
        await loadConversationSelector();
        document.getElementById('chat-messages').innerHTML =
            '<div class="chat-empty">Start chatting!</div>';
    } catch (err) {
        showToast('Failed to create conversation');
    }
}

async function loadConversationMessages() {
    if (!currentConversationId) return;

    const container = document.getElementById('chat-messages');
    try {
        const res = await fetch(`${API}/conversations/${currentConversationId}/messages`);
        if (!res.ok) return;
        const messages = await res.json();

        container.innerHTML = '';
        if (messages.length === 0) {
            container.innerHTML = '<div class="chat-empty">No messages yet. Start chatting!</div>';
            return;
        }

        for (const msg of messages) {
            container.appendChild(renderMessage(msg));
        }
        container.scrollTop = container.scrollHeight;
    } catch {
        // API not ready
    }
}

async function approvePipeline() {
    if (!currentPipelineId) return;
    await apiApprovePipeline(currentPipelineId);
    await refreshPipelineState();
    await renderBoard();
}

async function rejectPipeline() {
    if (!currentPipelineId) return;
    await apiRejectPipeline(currentPipelineId);
    await refreshPipelineState();
}

async function toggleAutoApprove() {
    autoApproveMode = !autoApproveMode;
    await apiSetAutoApprove(autoApproveMode);
    updateAutoApproveIndicator();
    updateApprovalBar(null); // Refresh approval bar visibility
    if (currentPipelineId) {
        await refreshPipelineState();
    }
}

// --- WebSocket chat event handling ---

function handleChatWsEvent(msg) {
    // Handle conversation events
    if (currentMode === 'chat' && msg.event === 'conversation_message') {
        const data = msg.data || {};
        if (data.conversation_id === currentConversationId) {
            loadConversationMessages();
        }
        return;
    }

    if (msg.event === 'quick_task_completed') {
        if (typeof renderBoard === 'function') renderBoard();
        return;
    }

    // Pipeline events
    if (!currentPipelineId) return;

    const pipelineEvents = [
        'pipeline_phase_changed', 'chat_message',
        'stories_generated', 'pipeline_completed',
    ];

    if (pipelineEvents.includes(msg.event)) {
        const data = msg.data || {};
        if (data.pipeline_id === currentPipelineId || !data.pipeline_id) {
            refreshPipelineState();
        }
        // Update pipeline selector on completion
        if (msg.event === 'pipeline_completed') {
            loadPipelineSelector();
        }
        // Refresh artifacts on data-producing events
        const artifactEvents = ['pipeline_phase_changed', 'stories_generated', 'pipeline_completed'];
        if (artifactEvents.includes(msg.event) && typeof refreshArtifactsPanel === 'function') {
            refreshArtifactsPanel();
        }
    }
}

// --- Keyboard shortcut ---

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const input = document.getElementById('chat-input');
        if (document.activeElement === input) {
            e.preventDefault();
            sendMessage();
        }
    }
});

// Close pipeline modal on overlay click
document.addEventListener('DOMContentLoaded', async () => {
    const pipelineModal = document.getElementById('pipeline-modal');
    if (pipelineModal) {
        pipelineModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePipelineModal();
        });
    }

    // Load auto-approve state from server
    autoApproveMode = await apiGetAutoApprove();
    updateAutoApproveIndicator();

    loadPipelineSelector();
    loadConversationSelector();

    // Start in chat mode
    switchChatMode('chat');

    // Poll for pipeline state changes — fallback only, WebSocket is primary
    chatPollTimer = setInterval(() => {
        if (currentPipelineId && (!ws || ws.readyState !== WebSocket.OPEN)) {
            refreshPipelineState();
        }
    }, 10000);
});
