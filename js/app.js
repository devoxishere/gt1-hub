/**
 * Main App Controller
 */
class GT1App {
    constructor() {
        this.midi = new MIDIController();
        this.storage = new StorageManager();
        this.currentBankIndex = 0;

        // Dom Elements
        this.els = {
            bankSelector: document.getElementById('bank-selector'),
            patchGrid: document.getElementById('patch-grid'),
            statusText: document.querySelector('.status-text'),
            statusIndicator: document.getElementById('connection-status'),
            currentPatchId: document.getElementById('current-patch-id'),
            currentPatchName: document.getElementById('current-patch-name'),
            btnExport: document.getElementById('btn-export'),
            btnImport: document.getElementById('btn-import'),
            debugLog: document.getElementById('debug-log')
        };

        this.init();
    }

    log(msg, type = 'info') {
        const div = document.createElement('div');
        const color = type === 'error' ? '#ff5252' : (type === 'success' ? '#4caf50' : '#0f0');
        div.style.color = color;
        div.textContent = `> [${new Date().toLocaleTimeString()}] ${msg}`;
        if (this.els.debugLog) {
            this.els.debugLog.appendChild(div);
            this.els.debugLog.scrollTop = this.els.debugLog.scrollHeight;
        }
        console.log(`[APP LOG] ${msg}`);
    }

    async init() {
        this.log("Starting GT1 Bank Manager v1.0.2...");

        // Setup MIDI callbacks
        this.midi.onStatusChange = (connected, deviceList) => {
            this.handleConnectionChange(connected, deviceList);
            if (connected) {
                this.log(`CONNECTED: ${this.midi.output.name}`, 'success');
            } else if (deviceList) {
                this.log(`No match in found devices: ${deviceList}`, 'info');
            }
        };
        this.midi.onPatchUpdate = (patchId) => this.updateActivePatchUI(patchId);
        this.midi.onLog = (msg, type) => this.log(msg, type);

        // Initialize MIDI
        this.log("Checking Web MIDI Access...");
        const success = await this.midi.init();
        if (!success) {
            this.log("FAILED to initialize MIDI. Check permissions or Chrome support.", "error");
        }

        // Setup Event Listeners
        this.setupListeners();

        // Initial Render
        this.renderBanks();
        this.renderPatches();
    }

    setupListeners() {
        this.els.btnExport.addEventListener('click', () => this.exportData());
        this.els.btnImport.addEventListener('click', () => this.importData());
    }

    handleConnectionChange(connected, deviceList) {
        if (connected) {
            this.els.statusIndicator.classList.add('connected');
            this.els.statusText.textContent = 'Connected: ' + (this.midi.output ? this.midi.output.name : 'Unknown');
        } else {
            this.els.statusIndicator.classList.remove('connected');
            const list = deviceList ? ` (Found: ${deviceList})` : '';
            this.els.statusText.textContent = 'No BOSS GT-1 found' + list;
            console.log("Status: Not connected. Devices seen:", deviceList);
        }
    }

    renderBanks() {
        this.els.bankSelector.innerHTML = this.storage.data.banks.map((bank, index) => `
            <button class="bank-btn ${index === this.currentBankIndex ? 'active' : ''}" data-index="${index}">
                <span>${bank.name}</span>
            </button>
        `).join('');

        // Add listeners to bank buttons
        this.els.bankSelector.querySelectorAll('.bank-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.switchBank(index);
            });
        });
    }

    renderPatches() {
        const bank = this.storage.data.banks[this.currentBankIndex];
        this.els.patchGrid.innerHTML = bank.patches.map(patch => `
            <div class="patch-card ${this.midi.currentPatch === patch.id ? 'active' : ''}" 
                 data-id="${patch.id}" 
                 style="border-left-color: ${patch.color}">
                <div class="patch-number">${patch.id.toString().padStart(2, '0')}</div>
                <div class="patch-info">
                    <div class="patch-name text-truncate">${patch.name}</div>
                </div>
                <button class="edit-btn" data-id="${patch.id}">✏️</button>
            </div>
        `).join('');

        // Add listeners to patch cards
        this.els.patchGrid.querySelectorAll('.patch-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                this.selectPatch(id);
            });
        });

        // Add listeners to edit buttons
        this.els.patchGrid.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                this.editPatch(id);
            });
        });

        this.updateActivePatchUI(this.midi.currentPatch);
    }

    switchBank(index) {
        this.currentBankIndex = index;
        this.renderBanks();
        this.renderPatches();
    }

    selectPatch(patchId) {
        this.midi.sendProgramChange(patchId);
        this.updateActivePatchUI(patchId);
    }

    updateActivePatchUI(patchId) {
        // Update highlight in grid
        this.els.patchGrid.querySelectorAll('.patch-card').forEach(card => {
            if (parseInt(card.dataset.id) === patchId) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        // Update footer display
        const patch = this.findPatchById(patchId);
        if (patch) {
            this.els.currentPatchId.textContent = `U${patchId.toString().padStart(2, '0')}`;
            this.els.currentPatchName.textContent = patch.name;
        } else {
            this.els.currentPatchId.textContent = '--';
            this.els.currentPatchName.textContent = 'Unknown Patch';
        }
    }

    findPatchById(patchId) {
        for (let bank of this.storage.data.banks) {
            const p = bank.patches.find(item => item.id === patchId);
            if (p) return p;
        }
        return null;
    }

    editPatch(patchId) {
        const patch = this.findPatchById(patchId);
        const newName = prompt(`Rename Patch ${patchId}:`, patch.name);
        if (newName !== null && newName.trim() !== "") {
            this.storage.updatePatchName(patchId, newName.trim());
            this.renderPatches();
        }
    }

    exportData() {
        const data = this.storage.getExportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gt1-banks-${new Date().getTime()}.json`;
        a.click();
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (this.storage.importData(event.target.result)) {
                    this.switchBank(0);
                    alert('Import Successful!');
                } else {
                    alert('Invalid file format.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}

// Global instance
window.app = new GT1App();
