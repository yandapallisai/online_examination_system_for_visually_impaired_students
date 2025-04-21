/*

document.addEventListener("contextmenu", (e) => e.preventDefault()); //disable right click

document.addEventListener("keydown", function(e){
    //disable ctrl+*, F12, Alt+Tab, etc
    if(e.ctrlKey || e.key === "F12" || e.key === "Tab" && e.altKey){
        e.preventDefault();
    }
});

// prevent the page from going back
history.pushState (null, null, location.href);
window.onpopstate = function(){
    history.go(1);
};

// Auto-exit or alert if user switches tab or leaves full screen

/*document.addEventListener("visibilitychange", function(){
    if(document.visibilityState == 'hidden'){
        alert("You left the exam tab, this will be reported");
        logViolation("Tab switch or fullscreen exit");
    }
});

// Optional: Monitor full screen exitdocument.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement) {
        alert("Full-screen exited. Returning to full screen...");
        document.body.requestFullscreen(); // Try to force back
    }
});

function logViolation(type) {
    const formData = new FormData();
    formData.append("type", type);
    formData.append("timestamp", new Date().toISOString());

    fetch('/log_violation', {
        method: 'POST',
        body: formData
    });
}*/

/*-------------------------------------------------------E X A M  L O G I C---------------------------------------------------*/
let questions = [];
let currentQuestionIndex = 0;
let answers = {};
let unansweredQuestionIndexes = [];
let currentUnansweredIndex = 0;

//Get assessment_id from URL
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

const assessmentId = getQueryParam("assessment_id");
const attendeeId = getQueryParam("attendee_id");

function fetchExamDetails(assessmentId) {
    axios.get(`/get_exam_details?assessment_id=${assessmentId}&attendee_id=${attendeeId}`)
        .then(response => {
            const examName = response.data.exam_name;
            const remainingSeconds = response.data.remaining_seconds

            document.getElementById("exam-name").innerText = examName ? examName : "Exam Name Not Found";
            document.getElementById("exam-id").innerText = `Assessment ID: ${assessmentId}`;
            document.getElementById("attendee-id").innerText = `Attendee ID: ${attendeeId}`;

            examDurationSeconds = remainingSeconds
            startExamTimer();
        })
        .catch(error => {
            console.error("Failed to fetch exam name:", error);
            document.getElementById("exam-name").innerText = "Error loading exam name";
        });
}

document.addEventListener("DOMContentLoaded", function () {
    if (assessmentId) {
        fetchExamDetails(assessmentId);
        fetchQuestions(assessmentId);
    } else {
        alert("Assessment ID not provided.");
    }

    document.getElementById("next-btn").addEventListener("click", () => {
        goToNextQuestion();
    });

    document.getElementById("prev-btn").addEventListener("click", () => {
        goToPreviousQuestion();
    });

    document.getElementById("repeat-btn").addEventListener("click", () =>{
        speakCurrentQuestion();
    });

    document.getElementById("submit-btn").addEventListener("click", () => {
        submitExam();
    });
});

function startExamTimer() {
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (examDurationSeconds <= 0) {
            clearInterval(timerInterval);
            alert("Time's up! Submitting your exam...");
            submitExam(); // Auto submit
        } else {
            examDurationSeconds--;
            updateTimerDisplay();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(examDurationSeconds / 60);
    const seconds = examDurationSeconds % 60;
    document.getElementById("time").innerText =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

//Fetch questions from backend
function fetchQuestions(assessmentId) {
    axios.get(`/get_questions?assessment_id=${assessmentId}`)
        .then(response => {
            questions = response.data.questions;
            if (questions.length > 0) {
                displayQuestion();
            } else {
                document.getElementById("question-box").innerText = "No questions available.";
            }
        })
        .catch(error => {
            console.error("Error fetching questions:", error);
        });
}

//Display current question
function displayQuestion() {
    const q = questions[currentQuestionIndex];

    document.getElementById("question-box").innerHTML = 
    `<p><strong>Q${currentQuestionIndex + 1}:</strong> ${q.question_text}</p>`
    ;

    document.getElementById("options-box").innerHTML = ``;
    document.getElementById("answer-box").innerHTML = ``;

    if (q.question_type === "mcq") {
        if (q.options && typeof q.options === "object") {
            const optionLabels = ["A", "B", "C", "D", "E", "F"]; // Add more if needed
            let index = 0;

            for (const key in q.options) {
                const option = q.options[key];
                const isChecked = answers[q.id] === option ? 'checked' : '';
                const label = optionLabels[index] || key;
                document.getElementById("options-box").innerHTML += `
                    <label>
                        <input type="radio" name="answer" value="${option}" ${isChecked}> <strong>Option ${label}:&nbsp;</strong>${option}
                    </label><br>
                `;
                index++;
            }
        }
    } else if (q.question_type === "text") {
        const previousAnswer = answers[q.id] || "";
        document.getElementById("answer-box").innerHTML =
            `<textarea id="text-answer" rows="4" cols="50" placeholder="Your answer here...">${previousAnswer}</textarea>`
        ;
    } else if (q.question_type === "fill_in_the_blank") {
        const previousAnswer = answers[q.id] || "";
        document.getElementById("answer-box").innerHTML =
            `<input type="text" id="text-answer" placeholder="Your answer here..." value="${previousAnswer}" />`
        ;
    }
    speakCurrentQuestion();
    updateStatusPanel(); 
}

function updateStatusPanel() {
    const statusGrid = document.getElementById("status-grid");
    statusGrid.innerHTML = ""; // Clear existing buttons

    questions.forEach((q, index) => {
        const isAnswered = answers[q.id] && answers[q.id].trim() !== "";
        const isCurrent = index === currentQuestionIndex;

        const button = document.createElement("button");
        button.innerText = index + 1;
        button.className = "status-button";

        if (isCurrent) {
            button.classList.add("current-question");
        } else if (isAnswered) {
            button.classList.add("answered-question");
        } else {
            button.classList.add("unanswered-question");
        }

        button.onclick = () => {
            saveCurrentAnswer(); // Save current before switching
            currentQuestionIndex = index;
            displayQuestion();
        };
        statusGrid.appendChild(button);
    });
}

function showNextUnansweredQuestion() {
    if (currentUnansweredIndex < unansweredQuestionIndexes.length) {
        const questionIndex = unansweredQuestionIndexes[currentUnansweredIndex];
        currentQuestionIndex = questionIndex;
        displayQuestion(currentQuestionIndex);  // Display the current question
        currentUnansweredIndex++;
    } else {
        alert("No more unanswered questions.");
        currentUnansweredIndex = 0;  // Reset to start showing unanswered questions again
    }
  }

let speakingNow = false;
let recognition = null;
let isListening = false;
let currentQuestionType = '';

function speakCurrentQuestion() {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    let questionText = `Question ${currentQuestionIndex + 1}: ${q.question_text.replace(/_+/g, " dash ")}`;

    if (q.question_type === "mcq" && q.options) {
        let index = 0;
        for (const key in q.options) {
            const option = q.options[key];
            const label = ["A", "B", "C", "D", "E", "F"][index] || key;
            questionText += `. Option ${label}: ${option}`;
            index++;
        }
    }
    speak(questionText);
}

//Save current question’s answer
function saveCurrentAnswer() {
    const q = questions[currentQuestionIndex];

    if (q.question_type === "mcq") {
        const selected = document.querySelector('input[name="answer"]:checked');
        if (selected) {
            answers[q.id] = selected.value;
        }
    } else if (q.question_type === "text" || q.question_type === "fill_in_the_blank") {
        const textAnswer = document.getElementById("text-answer");
        if (textAnswer) {
            answers[q.id] = textAnswer.value.trim();
        }
    }

    updateStatusPanel(currentQuestionIndex);
}

// Navigation functions
function goToNextQuestion() {
    saveCurrentAnswer();
    if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
    }
}

function goToPreviousQuestion() {
    saveCurrentAnswer();
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
}

function submitExam() {
    clearInterval(timerInterval);
    if (recognition) recognition.stop;
    saveCurrentAnswer();
    console.log("Submitted Answers:", answers);
    
    const assessmentId = getQueryParam("assessment_id");
    const attendeeId = getQueryParam("attendee_id");

    if(!assessmentId || !attendeeId) {
        alert("Missing assessment or attendee information");
        return;
    }

    axios.post('/submit_answers', {
        assessmentId: assessmentId,
        attendeeId: attendeeId,
        answers: answers
    })
    .then(response => {
        console.log("Server Response:", response.data);
        alert("Assessment Submitted Successfully!");
        window.location.href = "/";
    })
    .catch(error => {
        console.error("Submission Failed:", error);
        alert("There was an error submitting your answers.");
    });
}

function speak(text) {
    const synth = window.speechSynthesis;

    // Stop any ongoing speech
    if (synth.speaking) {
        synth.cancel();
    }

    // Stop recognition before speaking
    if (recognition && isListening) {
        recognition.stop();
        isListening = false;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1; // Speed (0.1 to 10) – 1 is normal
    utterance.pitch = 1; // Pitch (0 to 2)

    speakingNow = true;

    utterance.onend= () => {
        speakingNow = false;
        if(!isListening) {
            startListening();
        }
    }

    synth.speak(utterance);
}

function startListening() {
    if(isListening || speakingNow) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Your browser doesn't support voice recognition.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    const currentQuestion = questions[currentQuestionIndex];
    const qType = currentQuestion?.question_type;
    
    if (qType === "text") {
        recognition.continuous = true;
        recognition.interimResults = true;
        console.log("Text question")
    } else {
        recognition.continuous = false;
        recognition.interimResults = false;
    }

    recognition.onstart = () => {
        isListening = true;
        console.log("Listening started...");
    };

    recognition.onresult = (event) => handleVoiceCommand(event)

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        isListening = false;
    };

    recognition.onend = () => {
        isListening = false;
        // For text questions: keep listening until the user says "done"
        setTimeout(() => startListening(), 200);
    };

    recognition.start();
}

function handleVoiceCommand(event) {

    const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('')
            .trim()
            .toLowerCase();

        console.log("Heard:", transcript);

        if (transcript.includes("next")) {
            if (currentQuestionIndex < questions.length - 1) {
                goToNextQuestion();
            } else {
                speak("You are on the last question.");
            }
        } else if (transcript.includes("previous") || transcript.includes("back")) {
            if (currentQuestionIndex > 0) {
                goToPreviousQuestion();
            } else {
                speak("You are on the first question.");
            }
        } else if (transcript.includes("repeat") || transcript.includes("read again") || transcript.includes("say again")) {
            speakCurrentQuestion();
        } else if (
            transcript.includes("time left") ||
            transcript.includes("remaining time") ||
            transcript.includes("how much time")
        ) {
            speakRemainingTime();
        } else if (/option [a-f]/.test(transcript)) {
            const match = transcript.match(/option ([a-f])/);
            if (match) {
                const selectedLabel = match[1];
                const labels = ["a", "b", "c", "d", "e", "f"];
                const index = labels.indexOf(selectedLabel);
    
                const currentQuestion = questions[currentQuestionIndex];
                if (currentQuestion && currentQuestion.options) {
                    const optionKeys = Object.keys(currentQuestion.options);
                    const optionToSelect = currentQuestion.options[optionKeys[index]];
    
                    // Now check the correct radio button
                    const radios = document.querySelectorAll('input[name="answer"]');
                    radios.forEach(radio => {
                        if (radio.value === optionToSelect) {
                            radio.checked = true;
                            answers[currentQuestion.id] = optionToSelect;
                            console.log(`Selected: Option ${selectedLabel.toUpperCase()} -> ${optionToSelect}`);
                        }

                        speak(`Option ${selectedLabel.toUpperCase()} ${optionToSelect} selected`);
                    });
                }
            }
        } else if (transcript.includes("submit")) {
            submitExam();
        } else if (transcript.includes("questions not answered")) {
            unansweredQuestionIndexes = questions
            .map((q, index) => {
                if (!answers[q.id] || answers[q.id].trim() === "") {
                return index; // Add index of unanswered question
                }
                return null;
            })
            .filter(index => index !== null);

            // If there are no unanswered questions
            if (unansweredQuestionIndexes.length === 0) {
                speak("Every question is answered.");
            } else {
                currentUnansweredIndex = 0;
                showNextUnansweredQuestion();  // Show the next unanswered question
            }
          } else {
            // Handle text answer (for fill-in-the-blank or descriptive)
            const currentQuestion = questions[currentQuestionIndex];
            if (currentQuestion && !currentQuestion.options) {
                const inputBox = document.getElementById("text-answer");
                if (inputBox) {
                    inputBox.value = transcript;
                    answers[currentQuestion.id] = transcript;
                    console.log(`Text answer recorded: ${transcript}`);
                    speak(`Your answer has been recorded as: ${transcript}`);
                }
            }
        }
}

function speakRemainingTime() {
    const minutes = Math.floor(examDurationSeconds / 60);
    const seconds = examDurationSeconds % 60;
    const timeMessage = `You have ${minutes} minutes and ${seconds} seconds remaining.`;
    speak(timeMessage);
}

function selectOptionByLabel(label) {
    const q = questions[currentQuestionIndex];
    if (!q || q.question_type !== "mcq") return;

    const optionLabels = ["a", "b", "c", "d", "e", "f"];
    const labelIndex = optionLabels.indexOf(label.toLowerCase());

    if (labelIndex === -1) return;

    const options = Object.values(q.options);
    const selectedOption = options[labelIndex];
    
    if (!selectedOption) return;

    // Select the corresponding radio button
    const inputs = document.querySelectorAll('input[name="answer"]');
    inputs.forEach(input => {
        if (input.value === selectedOption) {
            input.checked = true;
        }
    });

    // Save answer immediately
    answers[q.id] = selectedOption;

    speak(`Option ${label.toUpperCase()} selected.`);
}