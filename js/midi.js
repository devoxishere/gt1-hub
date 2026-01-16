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
        
        // Scan Outputs
        for (let output of this.midiAccess.outputs.values()) {
            if (output.name.toLowerCase().includes('gt-1') || output.name.toLowerCase().includes('boss')) {
                this.output = output;
                found = true;
                break;
            }
        }

        // Scan Inputs
        for (let input of this.midiAccess.inputs.values()) {
            if (input.name.toLowerCase().includes('gt-1') || input.name.toLowerCase().includes('boss')) {
                this.input = input;
                this.input.onmidimessage = (msg) => this.handleMessage(msg);
                break;
            }
        }

        this.isConnected = found;
        if (this.onStatusChange) this.onStatusChange(this.isConnected);
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
