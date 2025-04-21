document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("menu-btn").addEventListener("click", toggleSidebar);
    document.getElementById("profile-btn").addEventListener("click", toggleDropdown);
    document.getElementById("loadProfile").addEventListener("click", loadUserProfile);
});

function toggleSidebar() {
    let sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("active");

    let mainContent = document.getElementById("dashboard-content");
    if (sidebar.classList.contains("active")) {
        mainContent.style.marginLeft = "250px";
    } else {
        mainContent.style.marginLeft = "0";
    }
}

function toggleDropdown(){
    let profile = document.querySelector(".profile");
    profile.classList.toggle("active");
}
document.addEventListener("click", function (event) {
    let profile = document.querySelector(".profile");
    let profileBtn = document.getElementById("profile-btn");

    if (!profile.contains(event.target) && event.target !== profileBtn) {
        profile.classList.remove("active");
    }
});


/*----------------------------------------------------------Fetch and Display User Profile----------------------------------------*/
function loadUserProfile() {
    fetch("/get_user")
        .then(response => response.json())
        .then(data => {
            // ✅ Insert user details into profile section
            document.getElementById("user-name").innerText = data.name;
            document.getElementById("user-email").innerText = data.email;
            document.getElementById("password").innerText = "••••••••";
            document.getElementById("toggle-password-btn").setAttribute("data-password", data.password);
            
            // ✅ Show profile section & hide dashboard
            document.getElementById("profile-section").style.display = "block";
            setTimeout(() => document.getElementById("profile-section").classList.add("show"), 10);
            document.getElementById("dashboard-content").style.display = "none";
            
            // ✅ Add event listener for password toggle (now that button exists)
            document.getElementById("toggle-password-btn").addEventListener("click", togglePassword);
            document.getElementById("close-profile-btn").addEventListener("click", closeProfile);
        })
        .catch(error => console.error("Error loading user profile:", error));
}

//Toggle Password Visibility
function togglePassword() {
    let passwordSpan = document.getElementById("password");
    let actualPassword = this.getAttribute("data-password");

    if (passwordSpan.innerText === "••••••••") {
        passwordSpan.innerText = actualPassword; 
        this.innerText = "Hide";
    } else {
        passwordSpan.innerText = "••••••••"; 
        this.innerText = "Show";
    }
}

//Close Profile and Restore Dashboard
function closeProfile() {
    document.getElementById("profile-section").classList.remove("show");
    setTimeout(() => document.getElementById("profile-section").style.display = "none", 300);
    document.getElementById("dashboard-content").style.display = "block";
}

/*----------------------------------------------------Load pages mentioned in the side bar---------------------------------------*/
function loadPage(page) {
    fetch(`/load_page/${page}`)  // Fetch content from Flask
        .then(response => response.text())
        .then(html => {
            document.getElementById("dashboard-content").innerHTML = html;
            if (page === "create_assessment") getassessmentDetails(); // Load page into dashboard-content
            if (page === "your_assessments") setTimeout(loadYourAssessments, 300); 
            if (page === "upload_attendees") setTimeout(getAttendeeDetails, 300);
            if (page == "upload_questions") extractQuestions();
            if (page == "view_performance") getPerformance();
        })
        .catch(error => console.error("Error loading page:", error));
}

//Create assessment
function getassessmentDetails(){
    let form = document.getElementById("create-assessment-form");

    if (!form) {
        console.error("Error: create-assessment-form not found.");
        return;
    }

    
    form.addEventListener("submit", function (event) {
        event.preventDefault();  // Prevent default form submission

        const title = document.getElementById("exam-title").value;
        const date = document.getElementById("exam-date").value;
        const time= document.getElementById("exam-time").value;
        const timeLimit = document.getElementById("time-limit").value;

        if (!title || !date || !time || !timeLimit ) {
            alert("Please fill in all fields!");
            return;
        }

        // Convert selected date & time to a Date object
        let selectedDateTime = new Date(`${date}T${time}`);
        let currentDateTime = new Date();

        // Prevent selection of past date & time
        if (selectedDateTime < currentDateTime) {
            alert("You cannot create an assessment in the past! Please check the date once..");
            return;
        }
    
        let formData = new FormData();
            formData.append("title", title);
            formData.append("exam_date", date);
            formData.append("exam_time", time);
            formData.append("time_limit", timeLimit);

        fetch("/create_exam", {  // Ensure the backend endpoint matches
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById("assessment-id").innerText = data.assessment_id;
                document.getElementById("expiry-date").innerText = data.expiry;
                document.getElementById("assessment-id-container").style.display = "block";

                form.reset();

            } else {
                alert("Failed to create exam. Try again.");
            }
        })
        .catch(error => console.error("Error:", error));
    });
}

//Upload questions
let extractedQuestions = [];

function extractQuestions() {
    let form = document.getElementById("upload-question-form");
    if (!form) {
        console.error("Error: upload-question-form not found.");
        return;
    }

    const extractBtn = document.getElementById("extract-btn");
    const storeBtn = document.getElementById("confirmSaveBtn");

    storeBtn.addEventListener("click", function (event) {
        event.preventDefault();
        const assessmentId = document.getElementById("assessment-id").value;
        const fileInput = document.getElementById("exam-file").files[0]

        if (!assessmentId || extractedQuestions.length === 0) {
            alert("Please extract and verify questions before saving.");
            return;
        }

        const formData = new FormData();
        formData.append("assessment_id", assessmentId);
        formData.append("questions", JSON.stringify(extractedQuestions));
        formData.append("exam_file", fileInput); // Send the file back

        fetch("/store_questions", {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert("Questions stored successfully!");
                document.getElementById("upload-question-form").reset();         // Reset the form
                extractedQuestions = [];                                        // Clear extracted questions
                document.getElementById("questions-list").innerHTML = "";       // Clear displayed questions
                document.getElementById("question-review-container").style.display = "none";
            } else if (result.error === "Exam is not active") {
                alert("Cannot store questions. This exam is expired or inactive.");
            } else if (result.error === "Assessment ID not found") {
                alert("Invalid assessment ID.");
            } else {
                alert("Failed to store questions: " + (result.error || result.message));
            }
        })
        .catch(error => {
            console.error("Error storing questions:", error);
            alert("Error storing questions.");
        });
    });

    extractBtn.addEventListener("click", function () {
        const assessmentId = document.getElementById("assessment-id").value;
        const fileInput = document.getElementById("exam-file").files[0];

        if (!assessmentId || !fileInput) {
            alert("Please fill in all fields!");
            return;
        }

        let formData = new FormData();
        formData.append("assessment_id", assessmentId);
        formData.append("exam_file", fileInput);

        fetch("/process_exam", {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            console.log("Server response:", data);

            if (data.success) {
                extractedQuestions = data.questions;
                let questionList = document.getElementById("questions-list");
                questionList.innerHTML = "";
                document.getElementById("question-review-container").style.display = "block";

                data.questions.forEach((q, index) => {
                    let li = document.createElement("li");
                    li.innerHTML = `<strong>Q${index + 1}:</strong> ${q.question_text}`;

                    if (q.options) {
                        let optionsHTML = "<ul>";
                        for (let key in q.options) {
                            optionsHTML += `<li><b>${key}:</b> ${q.options[key]}</li>`;
                        }
                        optionsHTML += "</ul>";
                        li.innerHTML += optionsHTML;
                    }

                    if (q.correct_answer) {
                        li.innerHTML += `<p><strong>Correct Answer:</strong> ${q.correct_answer}</p>`;
                    }

                    if (q.answer_text) {
                        li.innerHTML += `<p><strong>Answer Text:</strong> ${q.answer_text}</p>`;
                    }

                    questionList.appendChild(li);
                });
            } else {
                alert("Failed to extract questions. Try again.");
            }
        });
    });
}

function toDashboard(){
    window.location.href = "/dashboard";
}

function removeId(){
    // Hide the assessment ID container
    document.getElementById("assessment-id-container").style.display = "none";

    // Hide the extracted questions section
    document.getElementById("question-review-container").style.display = "none";

    // Clear the extracted question list
    document.getElementById("questions-list").innerHTML = "";

    // Reset container width
    document.querySelector(".container1").classList.remove("container-expanded");
}

//your assessment page
function loadYourAssessments() {
    let tableBody = document.querySelector("#table-design tbody");

    fetch("/your_assessments")
        .then(response => response.json())
        .then(data => {
            if (data.status !== "success") {
                alert("Error: " + data.message);
                return;
            }

            tableBody.innerHTML = ""; // Clear existing rows

            data.assessments.forEach(exam => {
                let statusClass = "";
                let cancelBtn = "";
                let fileClass = "";

                // Use `exam.status` instead of `exam.exam_status`
                let examStatus = exam.status ? exam.status.toLowerCase() : "unknown";

                switch (examStatus) {
                    case "active":
                        statusClass = "status-active";
                        cancelBtn = `<button class="cancel-btn" data-id="${exam.assessment_id}">Cancel Test</button>`;
                        break;
                    case "expired":
                        statusClass = "status-expired";
                        break;
                    case "cancelled":
                        statusClass = "status-cancelled";
                        break;
                    case "in progress":
                        statusClass = "status-inprogress";
                        break;
                    case "cancelled":
                        statusClass = "status-cancelled";
                        break;
                    default:
                        statusClass = "status-unknown";
                        break;
                }

                let fileStatus = exam.file_status;

                if (fileStatus == "Not uploaded"){
                    fileClass = "Not-upload";
                } else if(fileStatus == "Uploaded"){
                    fileClass = "upload";
                }

                let row = `<tr>
                    <td>${exam.assessment_id}</td>
                    <td>${exam.title}</td>
                    <td>${exam.date}</td>
                    <td>${exam.time}</td>
                    <td>${exam.duration}</td>
                    <td>${exam.created_date}</td>
                    <td>${exam.expiry}</td>
                    <td><span class = "${fileClass}">${exam.file_status}</span></td>
                    <td><span class="${statusClass}">${examStatus}</span></td>
                    <td>${cancelBtn}</td>
                </tr>`;

                tableBody.innerHTML += row;
            });

            // Attach event listeners to cancel buttons
            document.querySelectorAll(".cancel-btn").forEach(button => {
                button.addEventListener("click", function () {
                    let assessmentId = this.getAttribute("data-id");
                    cancelAssessment(assessmentId);
                });
            });
        })
        .catch(error => console.error("Error loading your assessments:", error));
}

function cancelAssessment(assessmentId) {
    if (!assessmentId) {
        console.error("Error: Assessment ID is undefined.");
        return;
    }
    let confirmation = confirm("Are you sure you want to cancel this exam?");
    
    if (!confirmation) {
        return;  // Stop if user clicks "Cancel"
    }

    let formData = new FormData();
    formData.append("assessment_id", assessmentId);

    fetch(`/cancel_assessment/${assessmentId}`, {
        method: "POST",
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            alert("Assessment canceled successfully.");
            loadYourAssessments(); // Refresh list after cancellation
        } else {
            alert("Error canceling assessment: " + data.message);
        }
    })
    .catch(error => console.error("Error:", error));
}

//Upload attendee details
function getAttendeeDetails() {
    let form = document.getElementById("upload-attendee-form");

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const assessmentId = document.getElementById("assessment-id").value;
        const imageUploads = document.querySelectorAll(".image-upload");

        if (!assessmentId || imageUploads.length === 0) {
            alert("All fields are required!");
            return;
        }

        let formData = new FormData();
        formData.append("assessment_id", assessmentId);

        imageUploads.forEach((upload, index) => {
            let attendeeId = upload.querySelector(".attendee-id").value;
            let attendeeName = upload.querySelector(".attendee-name").value;
            let faceImage = upload.querySelector(".face-image").files[0];

            if (arguments && attendeeName && faceImage) {
                formData.append(`attendee_ids[]`, attendeeId);
                formData.append(`attendee_names[]`, attendeeName);
                formData.append(`face_images[]`, faceImage);
            }
        });

        fetch("/upload_attendee_images", {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);

            if (data.success) {  // Clear the form only if upload is successful
                form.reset();  // Clear input fields
                document.getElementById("image-upload-container").innerHTML = ""; // Remove all added image upload sections
            }
        })
        .catch(error => console.error("Error:", error));
    });
    document.getElementById("add-more").addEventListener("click", function () {
        let container = document.getElementById("image-upload-container");
        let newUpload = document.createElement("div");
        newUpload.classList.add("image-upload");
        
        newUpload.innerHTML = `
            <label for="attendee-id">Attendee Id:</label>
            <input type="text" class="attendee-id" required>

            <label for="attendee-name">Attendee Name:</label>
            <input type="text" class="attendee-name" required>
            
            <label for="face-images">Upload Face Image:</label>
            <input type="file" accept="image/*" class="face-image" required>

            <button type="button" class="remove-btn" id="remove-btn">Remove</button>
        `;
    
        container.appendChild(newUpload);
        attachRemoveEvent();
    });

    //Function to Attach Remove Event to All Buttons
    function attachRemoveEvent() {
        document.querySelectorAll(".remove-btn").forEach(button => {
            button.removeEventListener("click", removeImageEntry);  // Remove previous listener to avoid duplicates
            button.addEventListener("click", removeImageEntry);
        });
    }

    // Function to Remove an Image Upload Entry
    function removeImageEntry(event) {
        event.target.parentElement.remove();  // Remove the corresponding div
    }
    //Attach Remove Button Events When Page Loads
    document.addEventListener("DOMContentLoaded", attachRemoveEvent);
}

function getPerformance() {
    let form = document.getElementById("get-performance-form");
    if (!form) {
        console.error("Error: get-performance-form not found.");
        return;
    }

    const fetchBtn = document.getElementById("fetch-btn");
    fetchBtn.addEventListener("click", () => {
        const assessmentId = document.getElementById("assessment-id").value.trim();
        const tableBody = document.querySelector("#table-design tbody");
        const performanceContainer = document.getElementById("performance-table-container");

        if (!assessmentId) {
            alert("Please enter a valid Assessment ID.");
            return;
        }

        fetch(`get_student_performance?assessment_id=${assessmentId}`)
        .then(response => response.json())
        .then(data => {
            if (data.status !== "success") {
                alert("Error: " + data.message);
                performanceContainer.style.display = "none";
                return;
            }

            // Populate assessment info
            document.getElementById("assessment-title").textContent = data.exam.title;
            document.getElementById("show-assessment-id").textContent = data.exam.assessment_id;

            const dateTimeParts = data.exam.datetime.split(" ");
            const dateParts = dateTimeParts[0].split("-");

            const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            const formattedDateTime = `${formattedDate} at ${dateTimeParts[1]}`;
            document.getElementById("exam-datetime").textContent = formattedDateTime;
            document.getElementById("assessment-info").style.display = "block";
            document.getElementById("container4").style.display = "none";

            console.log("Raw data from backend:", data);

            tableBody.innerHTML = "";

            data.performances.forEach(student => {
                const row = `<tr>
                    <td>${student.attendee_id}</td>
                    <td>${student.correct_answers}</td>
                    <td>${student.incorrect_answers}</td>
                    <td>${student.unanswered}</td>
                    <td>${student.total_marks}</td>
                </tr>`;
                tableBody.innerHTML += row;
            });
            

            performanceContainer.style.display = "block";
        })
        .catch(error => {
            console.error("Error fetching performance:", error);
            alert("An error occurred while fetching performance data.");
        });
    })
}
