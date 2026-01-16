/**
 * MIDI Controller for BOSS GT-1
 * Handles device discovery and Program Change messages
 */
class MIDIController {
    constructor() {
        this.midiAccess = null;
        this.output = null;
        this.input = null;
        this.currentPatch = 1;
        this.isConnected = false;
        this.onStatusChange = null;
        this.onPatchUpdate = null;
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.error('Web MIDI API not supported');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
            this.midiAccess.onstatechange = (e) => this.scanPorts();
            this.scanPorts();
            return true;
        } catch (err) {
            console.error('MIDI connection failed:', err);
            return false;
        }
    }

    scanPorts() {
        let found = false;
        console.log("Scanning MIDI ports...");

        if (!this.midiAccess) return;

        const outputs = Array.from(this.midiAccess.outputs.values());
        const inputs = Array.from(this.midiAccess.inputs.values());

        console.log("Available Outputs:", outputs.map(o => o.name));
        console.log("Available Inputs:", inputs.map(i => i.name));

        // Scan Outputs - Be more generic in matching
        for (let output of outputs) {
            const name = output.name.toLowerCase();
            if (name.includes('gt-1') || name.includes('boss') || name.includes('roland') || name.includes('midi')) {
                this.output = output;
                found = true;
                break;
            }
        }

        // Scan Inputs
        for (let input of inputs) {
            const name = input.name.toLowerCase();
            if (name.includes('gt-1') || name.includes('boss') || name.includes('roland') || name.includes('midi')) {
                this.input = input;
                this.input.onmidimessage = (msg) => this.handleMessage(msg);
                break;
            }
        }

        this.isConnected = found;
        if (this.onStatusChange) this.onStatusChange(this.isConnected, outputs.map(o => o.name).join(', '));
    }

    /**
     * Change patch on GT-1
     * @param {number} patchNumber 1 to 99 (User)
     */
    sendProgramChange(patchNumber) {
        if (!this.output || !this.isConnected) return false;

        // MIDI Program Change status byte for Channel 1 is 0xC0
        // Data1 is the program number (0-98 for patches 1-99)
        const programValue = Math.min(Math.max(patchNumber - 1, 0), 98);
        this.output.send([0xC0, programValue]);

        this.currentPatch = patchNumber;
        return true;
    }

    handleMessage(msg) {
        const [status, data1, data2] = msg.data;

        // Check for Program Change on Channel 1 (0xC0 to 0xCF)
        if ((status & 0xF0) === 0xC0) {
            const patchReceived = data1 + 1;
            this.currentPatch = patchReceived;
            if (this.onPatchUpdate) this.onPatchUpdate(patchReceived);
        }
    }
}
