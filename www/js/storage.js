/**
 * Storage Manager for Patch Names and Bank Configs
 */
class StorageManager {
    constructor() {
        this.KEY = 'gt1_bank_data_v1';
        this.data = this.load();
    }

    load() {
        const raw = localStorage.getItem(this.KEY);
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error('Failed to parse storage', e);
            }
        }
        return this.initDefaults();
    }

    initDefaults() {
        const banks = [];
        const colors = [
            '#2196F3', // blue
            '#4CAF50', // green
            '#FF9800', // orange
            '#F44336', // red
            '#9C27B0'  // purple
        ];

        // 99 patches / 5 per bank = 20 banks (last one has 4)
        for (let b = 0; b < 20; b++) {
            const patches = [];
            for (let p = 0; p < 5; p++) {
                const patchNum = (b * 5) + p + 1;
                if (patchNum <= 99) {
                    patches.push({
                        id: patchNum,
                        name: `Patch ${patchNum}`,
                        color: colors[p % 5]
                    });
                }
            }
            banks.push({
                id: b,
                name: `BANK ${String.fromCharCode(65 + b)}`,
                patches: patches
            });
        }

        return {
            config: {
                version: '1.0',
                lastModified: Date.now()
            },
            banks: banks,
            setlists: []
        };
    }

    save() {
        this.data.config.lastModified = Date.now();
        localStorage.setItem(this.KEY, JSON.stringify(this.data));
    }

    updatePatchName(patchId, newName) {
        for (let bank of this.data.banks) {
            const patch = bank.patches.find(p => p.id === patchId);
            if (patch) {
                patch.name = newName;
                this.save();
                return true;
            }
        }
        return false;
    }

    getExportData() {
        return JSON.stringify(this.data, null, 2);
    }

    importData(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            if (parsed.banks && Array.isArray(parsed.banks)) {
                this.data = parsed;
                this.save();
                return true;
            }
        } catch (e) {
            console.error('Import failed', e);
        }
        return false;
    }
}
