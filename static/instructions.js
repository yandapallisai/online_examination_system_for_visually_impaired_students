// Automatically read instructions and start listening on page load
window.onload = function () {
        readInstructions();
        startListening(); // Start voice recognition after reading
};

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

const assessmentId = getQueryParam("assessment_id");
const attendeeId = getQueryParam("attendee_id");

// Function to read text aloud
function readInstructions() {
    const text = document.body.innerText;
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 1.0;
    speech.volume = 1;
    speech.pitch = 1;

    speechSynthesis.speak(speech);
}

// Function to start speech recognition
function startListening() {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.start();

    recognition.onresult = function (event) {
        const command = event.results[0][0].transcript.toLowerCase();
        console.log("Voice command received:", command);

        if (command.includes("start exam")) {
            speechSynthesis.cancel();
            window.location.href = `/exam?assessment_id=${assessmentId}&attendee_id=${attendeeId}`; // Navigate to exam route
        } else if(command .includes("go back")){
            speechSynthesis.cancel();
            window.location.href = "/"; // Navigate to index page
        } else {
            const errorSpeech = new SpeechSynthesisUtterance("Command not recognized. Please say Start Exam to begin.");
            errorSpeech.lang = "en-US";
            speechSynthesis.speak(errorSpeech);
        }
    };

    recognition.onerror = function (event) {
        console.error("Speech recognition error:", event.error);
    };

    recognition.onend = function () {
        recognition.start(); // Keep listening
    };
}

// Stop speech on navigation
window.addEventListener("beforeunload", function (e) {
    speechSynthesis.cancel();
});

