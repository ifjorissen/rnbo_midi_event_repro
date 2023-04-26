// midi device: "midi-maker" patch. generates midi notes (no input needed).
// taken directly from RNBO's chaining-midi patch.
let midiDevice;

// synthdevice: "simple-synth" patch. takes in midi notes, outputs signal.
// taken directly from RNBO's chaining-midi patch.
let synthDevice;

// midiChordGeneratorDevice: an RNBO patch that takes in midi input and
// generates major or minor chords (sequence of notes) & sends that to midiout.
let midiChordGeneratorDevice;

async function setup() {
    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();
    outputNode.connect(context.destination);

    // load a patcher that generates midi notes (no input needed)
    let response = await fetch("export/midi-maker.export.json");
    let midiPatcher = await response.json();

    // load a patcher that accepts a midi note input and generates
    // a sequence of notes (to be played as a chord) by synth device
    response = await fetch("export/random_chords.export.json");
    let midiChordGeneratorPatcher = await response.json();

    // load a patcher that has a midi input and signal outs
    response = await fetch("export/patch.export.json");
    let synthPatcher = await response.json();
    let patcher = midiPatcher;

    if (!window.RNBO) {
        // Load RNBO script dynamically
        // Note that you can skip this by knowing the RNBO version of your patch
        // beforehand and just include it using a <script> tag
        await loadRNBOScript(patcher.desc.meta.rnboversion);
    }

    document.body.onclick = (_) => context.resume();

    midiDevice = await RNBO.createDevice({ context, patcher: midiPatcher });
    midiChordGeneratorDevice = await RNBO.createDevice({ context, patcher: midiChordGeneratorPatcher });
    synthDevice = await RNBO.createDevice({ context, patcher: synthPatcher });
    synthDevice.node.connect(outputNode);

    // set up message event listeners
    midiDevice.messageEvent.subscribe((ev) => {
        console.log(`MIDI Received message ${ev.tag}: ${ev.payload}`);
        if (ev.tag === "out1") console.log("from the first outlet");
    });

    midiChordGeneratorDevice.messageEvent.subscribe((ev) => {
        console.log(`MIDI CHORD GENERATOR Received message ${ev.tag}: ${ev.payload}`);
        if (ev.tag === "out1") console.log("from the first outlet");
    });

    synthDevice.messageEvent.subscribe((ev) => {
        console.log(`SYNTH Received message ${ev.tag}: ${ev.payload}`);
        if (ev.tag === "out1") console.log("from the first outlet");
    });

    // set up midi event listeners
    synthDevice.midiEvent.subscribe((ev) => {
        console.log(`SYNTH Received MIDI EVENT ${ev} ${ev.data}`);
        // Handle the outgoing MIDIEvent
        let type = ev.data[0];
    
        // Test for note on
        if (type >> 4 === 9) {
            let pitch = ev.data[1];
            let velocity = ev.data[2];
            console.log(`Received MIDI note on with pitch ${pitch} and velocity ${velocity}`);
        }
    });

    midiDevice.midiEvent.subscribe((ev) => {
        console.log(`MIDIDEVICE Received MIDI EVENT ${ev}: ${ev.data}`);
        // Handle the outgoing MIDIEvent
        let type = ev.data[0];
    
        // Test for note on
        if (type >> 4 === 9) {
            let pitch = ev.data[1];
            let velocity = ev.data[2];
            console.log(`Received MIDI note on with pitch ${pitch} and velocity ${velocity}`);
        }

        // forward to synth device
        synthDevice.scheduleEvent(ev);
    });

    midiChordGeneratorDevice.midiEvent.subscribe((ev) => {
        console.log(`MIDICHORDGENERATOR Received MIDI EVENT ${ev}: ${ev.data}`);

        // Handle the outgoing MIDIEvent
        let type = ev.data[0];
    
        // Test for note on
        if (type >> 4 === 9) {
            let pitch = ev.data[1];
            let velocity = ev.data[2];
            console.log(`Received MIDI note on with pitch ${pitch} and velocity ${velocity}`);
        }

        // forward to synth device
        synthDevice.scheduleEvent(ev);
    });

    // (Optional) Automatically create sliders for the device parameters
    makeSliders(midiChordGeneratorDevice);
    makeSliders(synthDevice);
    makeSliders(midiDevice);

    // (Optional) Create a form to send messages to RNBO inputs
    makeInportForm(midiDevice);

    // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
    attachOutports(midiDevice);

    // (Optional) Load presets, if any
    loadPresets(midiChordGeneratorDevice, patcher);

    // (Optional) Connect MIDI inputs
    makeMIDIKeyboard(midiChordGeneratorDevice, midiChordGeneratorPatcher.desc.meta.filename);
    makeMIDIKeyboard(synthDevice, synthPatcher.desc.meta.filename);

    //alert('click midi keyboard to send midi notes to "midiChordGeneratorDevice" and route to "simpleSynth"');

    // Skip if you're not using guardrails.js
    if (typeof guardrails === "function")
        guardrails();
}

// Sends a note to a device.
function sendNoteToDevice(note, device) {
    console.log(device);
    console.log(`send note ${note} to device`);
    let midiChannel = 0;

    // Format a MIDI message paylaod, this constructs a MIDI on event
    let noteOnMessage = [
        144 + midiChannel, // Code for a note on: 10010000 & midi channel (0-15)
        note, // MIDI Note
        127 // MIDI Velocity
    ];

    let noteOffMessage = [
        128 + midiChannel, // Code for a note off: 10000000 & midi channel (0-15)
        note, // MIDI Note
        0 // MIDI Velocity
    ];

    // Including rnbo.min.js (or the unminified rnbo.js) will add the RNBO object
    // to the global namespace. This includes the TimeNow constant as well as
    // the MIDIEvent constructor.
    let midiPort = 0;
    let noteDurationMs = 500;

    let deviceNoteOnEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000, midiPort, noteOnMessage);
    let deviceNoteOffEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000 + noteDurationMs, midiPort, noteOffMessage);
    device.scheduleEvent(deviceNoteOnEvent);
    device.scheduleEvent(deviceNoteOffEvent);
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            throw new Error("Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.");
        }
        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            console.log(err);
            reject(new Error("Failed to load rnbo.js v" + version));
        };
        document.body.append(el);
    });
}

function makeSliders(device) {
    let pdiv = document.getElementById("rnbo-parameter-sliders");
    let noParamLabel = document.getElementById("no-param-label");
    if (noParamLabel && device.numParameters > 0) pdiv.removeChild(noParamLabel);

    // This will allow us to ignore parameter update events while dragging the slider.
    let isDraggingSlider = false;
    let uiElements = {};

    device.parameters.forEach(param => {
        // Subpatchers also have params. If we want to expose top-level
        // params only, the best way to determine if a parameter is top level
        // or not is to exclude parameters with a '/' in them.
        // You can uncomment the following line if you don't want to include subpatcher params
        
        //if (param.id.includes("/")) return;

        // Create a label, an input slider and a value display
        let label = document.createElement("label");
        let slider = document.createElement("input");
        let text = document.createElement("input");
        let sliderContainer = document.createElement("div");
        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(text);

        // Add a name for the label
        label.setAttribute("name", param.name);
        label.setAttribute("for", param.name);
        label.setAttribute("class", "param-label");
        label.textContent = `${param.name}: `;

        // Make each slider reflect its parameter
        slider.setAttribute("type", "range");
        slider.setAttribute("class", "param-slider");
        slider.setAttribute("id", param.id);
        slider.setAttribute("name", param.name);
        slider.setAttribute("min", param.min);
        slider.setAttribute("max", param.max);
        if (param.steps > 1) {
            slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
        } else {
            slider.setAttribute("step", (param.max - param.min) / 1000.0);
        }
        slider.setAttribute("value", param.value);

        // Make a settable text input display for the value
        text.setAttribute("value", param.value.toFixed(1));
        text.setAttribute("type", "text");

        // Make each slider control its parameter
        slider.addEventListener("pointerdown", () => {
            isDraggingSlider = true;
        });
        slider.addEventListener("pointerup", () => {
            isDraggingSlider = false;
            slider.value = param.value;
            text.value = param.value.toFixed(1);
        });
        slider.addEventListener("input", () => {
            let value = Number.parseFloat(slider.value);
            param.value = value;
        });

        // Make the text box input control the parameter value as well
        text.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                let newValue = Number.parseFloat(text.value);
                if (isNaN(newValue)) {
                    text.value = param.value;
                } else {
                    newValue = Math.min(newValue, param.max);
                    newValue = Math.max(newValue, param.min);
                    text.value = newValue;
                    param.value = newValue;
                }
            }
        });

        // Store the slider and text by name so we can access them later
        uiElements[param.id] = { slider, text };

        // Add the slider element
        pdiv.appendChild(sliderContainer);
    });

    // Listen to parameter changes from the device
    device.parameterChangeEvent.subscribe(param => {
        if (!isDraggingSlider)
            uiElements[param.id].slider.value = param.value;
        uiElements[param.id].text.value = param.value.toFixed(1);
    });
}

function makeInportForm(device) {
    const idiv = document.getElementById("rnbo-inports");
    const inportSelect = document.getElementById("inport-select");
    const inportText = document.getElementById("inport-text");
    const inportForm = document.getElementById("inport-form");
    let inportTag = null;
    
    // Device messages correspond to inlets/outlets or inports/outports
    // You can filter for one or the other using the "type" of the message
    const messages = device.messages;
    const inports = messages.filter(message => message.type === RNBO.MessagePortType.Inport);

    if (inports.length === 0) {
        idiv.removeChild(document.getElementById("inport-form"));
        return;
    } else {
        idiv.removeChild(document.getElementById("no-inports-label"));
        inports.forEach(inport => {
            const option = document.createElement("option");
            option.innerText = inport.tag;
            inportSelect.appendChild(option);
        });
        inportSelect.onchange = () => inportTag = inportSelect.value;
        inportTag = inportSelect.value;

        inportForm.onsubmit = (ev) => {
            // Do this or else the page will reload
            ev.preventDefault();

            // Turn the text into a list of numbers (RNBO messages must be numbers, not text)
            const values = inportText.value.split(/\s+/).map(s => parseFloat(s));
            
            // Send the message event to the RNBO device
            let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
            device.scheduleEvent(messageEvent);
        }
    }
}

function attachOutports(device) {
    const outports = device.outports;
    if (outports.length < 1) {
        document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
        return;
    }

    document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
    device.messageEvent.subscribe((ev) => {

        // Ignore message events that don't belong to an outport
        if (outports.findIndex(elt => elt.tag === ev.tag) < 0) return;

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);

        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}

function loadPresets(device, patcher) {
    let presets = patcher.presets || [];
    if (presets.length < 1) {
        document.getElementById("rnbo-presets").removeChild(document.getElementById("preset-select"));
        return;
    }

    document.getElementById("rnbo-presets").removeChild(document.getElementById("no-presets-label"));
    let presetSelect = document.getElementById("preset-select");
    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.innerText = preset.name;
        option.value = index;
        presetSelect.appendChild(option);
    });
    presetSelect.onchange = () => device.setPreset(presets[presetSelect.value].preset);
}

function makeMIDIKeyboard(device, name) {
    let mdiv = document.getElementById("rnbo-clickable-keyboard");
    if (device.numMIDIInputPorts === 0) return;

    let container = document.createElement("div");
    container.classList.add("keyboard");
    let p = document.createElement("p");
    p.textContent = `send a note to ${name}`;
    mdiv.appendChild(p);
    mdiv.appendChild(container);

    const midiNotes = [49, 52, 56, 63];
    midiNotes.forEach(note => {
        const key = document.createElement("div");
        const label = document.createElement("p");
        label.textContent = note;
        key.appendChild(label);
        key.addEventListener("pointerdown", () => {
            sendNoteToDevice(note, device);
            key.classList.add("clicked");
        });

        key.addEventListener("pointerup", () => key.classList.remove("clicked"));

        container.appendChild(key);
    });
}

setup();
