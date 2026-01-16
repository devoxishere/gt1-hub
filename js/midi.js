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
        this.onLog = null;
        this.usbDevice = null; // WebUSB device
    }

    setUSBDevice(device) {
        this.usbDevice = device;
        this.isConnected = true;
    }

    log(msg, type) {
        if (this.onLog) this.onLog(msg, type);
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            this.log('Web MIDI API not supported in this browser', 'error');
            return false;
        }

        try {
            this.log("Acquiring MIDI Access...");
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
            this.midiAccess.onstatechange = (e) => {
                this.log(`MIDI State Change: ${e.port.name} is now ${e.port.state}`, 'info');
                this.scanPorts();
            };
            this.scanPorts();
            return true;
        } catch (err) {
            this.log('MIDI Permission Refused: ' + err.message, 'error');
            return false;
        }
    }

    scanPorts() {
        let found = false;
        this.log("Scanning Ports...", "info");

        if (!this.midiAccess) return;

        const outputs = Array.from(this.midiAccess.outputs.values());
        const inputs = Array.from(this.midiAccess.inputs.values());

        this.log(`Ports Found: OUT[${outputs.length}] IN[${inputs.length}]`, 'info');

        if (outputs.length > 0) {
            this.log(`OUT names: ${outputs.map(o => o.name).join(' | ')}`, 'info');
        }

        // Scan Outputs - Be more generic in matching
        for (let output of outputs) {
            const name = output.name.toLowerCase();
            this.log(`Testing Output: ${output.name}`, 'info');
            if (name.includes('gt-1') || name.includes('boss') || name.includes('roland') || name.includes('midi')) {
                this.output = output;
                found = true;
                this.log(`Matched Output: ${output.name}`, 'success');
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
        const programValue = Math.min(Math.max(patchNumber - 1, 0), 98);
        const midiMessage = [0xC0, programValue];

        // Method 1: Try Web MIDI API
        if (this.output && this.isConnected) {
            try {
                this.output.send(midiMessage);
                this.currentPatch = patchNumber;
                return true;
            } catch (e) {
                this.log("Web MIDI send failed, trying Direct USB...", "info");
            }
        }

        // Method 2: Try Direct WebUSB (For Android/Boss Vendor mode)
        if (this.usbDevice) {
            this.sendDirectUSB(midiMessage);
            this.currentPatch = patchNumber;
            return true;
        }

        return false;
    }

    async sendDirectUSB(data) {
        if (!this.usbDevice) return;

        try {
            // BOSS GT-1 MIDI usually expects 4-byte packets over USB Bulk
            // [Cable Number + Code Index | Status | Data1 | Data2]
            const usbPacket = new Uint8Array([0x0C, data[0], data[1], 0x00]);

            if (!this.usbDevice.opened) await this.usbDevice.open();

            // Attempt to find the MIDI interface (usually the last one for Roland/Boss)
            const interfaceNum = this.usbDevice.configurations[0].interfaces.length - 1;

            await this.usbDevice.selectConfiguration(1);
            await this.usbDevice.claimInterface(interfaceNum);

            // Transfer to the Bulk Out endpoint (usually 0x02 or 0x03)
            await this.usbDevice.transferOut(interfaceNum + 1, usbPacket);
            this.log(`Direct USB MIDI Sent: PC ${data[1]}`, "success");
        } catch (err) {
            this.log(`Direct USB Error: ${err.message}`, "error");
            // If claiming fails, some devices need specific interface numbers
            this.log("Try reconnecting USB cable or restarting App.", "info");
        }
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
