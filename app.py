import cv2
import numpy as np
import pdfplumber
import re
from werkzeug.utils import secure_filename
from insightface.app import FaceAnalysis
from sklearn.metrics.pairwise import cosine_similarity
import uuid
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, Response, url_for, session, redirect, json
from models.database import db, User, Exam, ExamFiles, ExamAttendees, Question, AttendeeAnswer, Performance
from flask_migrate import Migrate
from models import *

app = Flask(__name__)
app.secret_key = 'your_secret_key' #needed for session

# Initialize InsightFace model
face_app = FaceAnalysis(name='buffalo_l')  # 'buffalo_l' is a high-accuracy model
face_app.prepare(ctx_id=0)  # Use GPU if available

ALLOWED_EXTENSIONS = {"pdf"}

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///default.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Configure Users Database
app.config['SQLALCHEMY_BINDS'] = {
    'users': 'sqlite:///users.db',
    'exams': 'sqlite:///exams.db',
    'examination': 'postgresql://flask_user:flask@localhost:5432/examination'  # PostgreSQL
}

# Initialize both databases
db.init_app(app)
migrate = Migrate(app, db)

# Create both databases
with app.app_context():
    db.create_all()

#route for index
@app.route("/")
def index():
    return render_template("index.html")

#route for signup
@app.route("/signup", methods=["GET"])
def signup_page():
    return render_template("signup.html")

@app.route("/signup", methods=["POST"])
def signup():
    name = request.form.get("name")
    email = request.form.get("email")
    password = request.form.get("password")
    

    if not name or not email or not password:
        return jsonify({"status": False, "message": "All fields are required!!"})
    
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"status": False, "message": "Email already registered!!"})
    
    new_user = User(name=name, email=email, password=password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"status": True, "message": "Signup successful!"})

@app.route("/get_user")
def get_user():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 403  #Return error if not logged in

    user = db.session.get(User, session.get("user_id"))  #Fetch logged-in user
    return jsonify({
        "name": user.name,
        "email": user.email,
        "password": user.password  #Send password (but hidden in frontend)
    })

#route for login
@app.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")

@app.route("/login", methods=["POST"])
def login():
    email = request.form.get("email")
    password = request.form.get("password")

    user = User.query.filter_by(email=email, password=password).first()

    if user:
        session["user_id"] = user.id  # Store user session
        session["user_email"] = user.email
        return jsonify({"status": True, "message": "Login successful!", "access": "granted"})

    return jsonify({"status": False, "message": "Incorrect email or password!"})

#route for dashboard
@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect(url_for("login_page"))  # Redirect to login if not logged in

    user = db.session.get(User, session.get("user_id"))  # Fetch user from database
    return render_template("dashboard.html", user=user)

@app.route("/load_page/<page>")
def load_page(page):
    #Map requested page to corresponding template
    pages = {
        "create_assessment": "create_assessment.html",
        "view_performance": "view_performance.html",
        "your_assessments": "your_assessments.html",
        "upload_attendees": "upload_attendee_images.html",
        "upload_questions": "upload_questions.html"
    }
    
    if page in pages:
        return render_template(pages[page])  #Return corresponding template
    return "<h2>Page not found</h2>", 404

#Check Allowed File Extensions
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route("/create_exam", methods=["POST"])
def create_exam():

    if "user_id" not in session:
        return jsonify({"success": False, "message": "User not logged in!"})
    
    user = db.session.get(User, session.get("user_id"))

    # Get form data
    exam_title = request.form.get("title")
    exam_date = request.form.get("exam_date")
    exam_time = request.form.get("exam_time")
    time_limit = request.form.get("time_limit")

    # Validate inputs
    if not exam_title or not exam_date or not exam_time or not time_limit:
        return jsonify({"success": False, "message": "All fields are required!"})


    # Generate a unique assessment ID
    assessment_id = str(uuid.uuid4())[:10]  # Generate an 10-character ID

    # Convert exam date and time to datetime object
    exam_datetime = datetime.strptime(exam_date + " " + exam_time, "%Y-%m-%d %H:%M")
    current_datetime = datetime.now()

    # Check if exam datetime is in the past
    if exam_datetime < current_datetime:
        return jsonify({"status": "error", "message": "You cannot create an assessment in the past!"}), 400

    # Convert duration (assuming duration is in minutes)
    expiry_time = exam_datetime + timedelta(minutes=int(time_limit)) # Exam valid until duration of exam

    # Save to database
    new_exam = Exam(
        assessment_id=assessment_id,
        title=exam_title,
        date=exam_date,
        time=exam_time,
        duration=int(time_limit),
        expiry=expiry_time,
        created_by=user.email,  # Retrieve from logged-in user
        created_date=datetime.now(),
        file_status = "Not uploaded",
        exam_status = "Active"
    )

    db.session.add(new_exam)

    db.session.commit()

    return jsonify({
        "success": True,
        "assessment_id": assessment_id,
        "expiry": expiry_time.strftime("%d/%m/%Y %H:%M:%S"),
        "message": "Exam created successfully!"
    })

@app.route("/process_exam", methods=["POST"])
def process_exam():
    if "exam_file" not in request.files:
        return jsonify({"success": False, "message": "No file uploaded"}), 400

    file = request.files["exam_file"]
    file_extension = file.filename.split(".")[-1].lower()

    if file_extension == "pdf":
        text = extract_text_from_pdf(file.stream)
    else:
        return jsonify({"success": False, "message": "Invalid file format"}), 400

    questions = extract_questions(text)

    if not questions:
        return jsonify({"success": False, "message": "No questions found"}), 400

    return jsonify({"success": True, "questions": questions})

def extract_text_from_pdf(pdf_stream):
    """Extract text from a PDF file (file-like object)."""
    text = ""
    with pdfplumber.open(pdf_stream) as pdf:
        for page in pdf.pages:
            text += page.extract_text() + "\n"
    return text

def extract_questions(text):
    """Extracts questions from text using regex."""
    questions = []

    # Regex for questions (Handles Q., Question., 1., 1), (1))
    mcq_pattern = re.compile(
        r"(?:Q\.|Question\.|\d+\)|\d+\.)\s*(?P<question>.+?)\n(?:A\.|A\)|\(A\)|Option A)",
        re.DOTALL
    )

    #Regex for multiple-choice options (A., A), (A), Option A.)
    option_pattern = re.compile(
    r"(?:A\.|A\)|\(A\)|Option A\.?)\s*(?P<A>.*?)\s*"
    r"(?:B\.|B\)|\(B\)|Option B\.?)\s*(?P<B>.*?)\s*"
    r"(?:C\.|C\)|\(C\)|Option C\.?)\s*(?P<C>.*?)\s*"
    r"(?:D\.|D\)|\(D\)|Option D\.?)\s*(?P<D>.*?)\s*(?=\n|$)"
    )

    # Regex for MCQ answer (Handles "Answer: (B)", "Answer: B", and "Answer: (B) Some option text")
    answer_pattern = re.compile(
        r"Answer:\s*(?P<answer>.+)",  # Capture any text after "Answer:"
        re.IGNORECASE
    )

    fill_in_the_blank_pattern = re.compile(
        r"(?:Q\.|Question\.|\d+\)|\d+\.)\s*(?P<question>.+?_{3,}.*?[.?])\nAnswer:\s*(?P<answer>.+)", 
        re.MULTILINE
    )

    text_pattern = re.compile(
        r"(?:Q\.|Question\.|\d+\)|\d+\.)\s*(?P<question>.+?[.?])\s*(?=\n|$)", 
        re.MULTILINE 
    )

    # Extract questions
    question_matches = mcq_pattern.findall(text)

    for i, question_text in enumerate(question_matches):

        # Extract options for the current question
        option_match = option_pattern.search(text.split(question_text)[1])
        
        # Extract the correct answer for the current question
        answer_match = answer_pattern.search(text.split(question_text)[1])

        # Prepare the options for this question
        if option_match:
            options = {
                "A": option_match.group("A").strip(),
                "B": option_match.group("B").strip(),
                "C": option_match.group("C").strip(),
                "D": option_match.group("D").strip()
            }
        else:
            options = None

        # Extract correct answer and its text
        if answer_match:
            correct_answer = answer_match.group("answer").strip()
        else:
            correct_answer = None

        # If no options are found and there's an answer, treat this as a fill-in-the-blank
        if not options and correct_answer:
            questions.append({
                "question_text": question_text.strip(),
                "question_type": "fill_in_the_blank",
                "options": None,
                "correct_answer": correct_answer,
            })
        else:
            # Otherwise, treat it as an MCQ
            questions.append({
                "question_text": question_text.strip(),
                "question_type": "mcq",  # Since these are MCQs
                "options": options,
                "correct_answer": correct_answer,
            })

    # Extract Fill in the Blanks Questions
    for match in fill_in_the_blank_pattern.finditer(text):
        question_text = match.group("question")
        after_question = text.split(question_text, 1)[1]


        # Check if there are options in the question, if so, treat it as MCQ, not fill-in-the-blank
        option_match = option_pattern.search(after_question)
        if option_match:
            continue  # Skip if options exist, it's an MCQ, not a fill-in-the-blank

        # Extract correct answer
        answer_match = answer_pattern.search(after_question)
        correct_answer = answer_match.group("answer").strip() if answer_match else None

        questions.append({
            "question_text": question_text.strip(),
            "question_type": "fill_in_the_blank",
            "options": None,
            "correct_answer": correct_answer
        })

       
     #Extract Short & Long Answer Questions
    for match in text_pattern.finditer(text):
        question_text = match.group("question")

        # Ensure not adding as an MCQ or fill-in-the-blank question
        if any(question_text in q['question_text'] for q in questions):
            continue  # Skip already processed questions

        # Ensure not adding as an MCQ or fill-in-the-blank question
        if any(question_text in q['question_text'] for q in questions):
            continue  # Skip already processed questions

        questions.append({
            "question_text": question_text.strip(),
            "question_type": "text",
            "options": None,
            "correct_answer": None
        })

    return questions

@app.route('/store_questions', methods=['POST'])
def store_questions():
    try:
        # Get the form data
        assessment_id = request.form.get("assessment_id")
        questions = request.form.get("questions")

        if not assessment_id or not questions:
            return jsonify({'error': 'Missing assessment ID or questions'})
        
        questions = json.loads(questions)

        # Validate assessment_id
        exam = Exam.query.filter_by(assessment_id=assessment_id).first()
        if not exam:
            return jsonify({'error': 'Assessment ID not found'})
        if exam.exam_status.lower() != 'active':
            return jsonify({'error': 'Exam is not active'})
        
        # Handle file upload
        if "exam_file" not in request.files:
            return jsonify({"success": False, "message": "No file uploaded!"})

        file = request.files["exam_file"]
        if file.filename == "":
            return jsonify({"success": False, "message": "No file selected!"})

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_data = file.read() #read file contents as binary
        else:
            return jsonify({"success": False, "message": "Invalid file format! Upload PDF."})
        
        # Save the question paper in ExamFiles table
        new_exam_file = ExamFiles(
            assessment_id=assessment_id,
            question_paper=file_data,  # Store binary data
            filename=filename
        )
        db.session.add(new_exam_file)
        db.session.commit()

        # Store each question
        for q in questions:
            new_question = Question(
                assessment_id=assessment_id,
                question_text=q.get('question_text'),
                question_type=q.get('question_type'),
                options=q.get('options'),
                correct_answer=q.get('correct_answer')
            )
            db.session.add(new_question)

        db.session.commit()

        exams = Exam.query.filter_by(assessment_id = assessment_id).first()

        if exams:
            exams.file_status = "Uploaded"
            db.session.commit()

        return jsonify({'success': True, 'message': 'Questions saved successfully'})
    except Exception as e:
        db.session.rollback()
        print("Error occurred:", str(e))
        return jsonify({'success': False, 'error': f'Failed to save questions: {str(e)}'})

@app.route('/your_assessments')
def your_assessments():
    user = db.session.get(User, session.get("user_id"))  # Get the logged-in user ID

    if not user:
        return jsonify({"status": "error", "message": "User not logged in"}), 401

    # Fetch all exams created by the logged-in user
    exams = Exam.query.filter_by(created_by=user.email).all()

    # Get current UTC time
    current_time = datetime.now()

    # Format the data to send to frontend
    exams_data = []
    for exam in exams:
        exam_start_time = datetime.strptime(f"{exam.date} {exam.time}", "%Y-%m-%d %H:%M")
        expiry_time = exam.expiry  # Assuming expiry is stored as a datetime object

        # Ensure that a canceled exam remains canceled
        if exam.exam_status != "Cancelled":
            # Update exam status based on expiry
            if expiry_time and current_time > expiry_time:
                exam.exam_status = "Expired"
            elif exam_start_time <= current_time <= expiry_time:
                exam.exam_status = "In Progress" 
        
        db.session.commit() # Save changes to the database

        exams_data.append({
            "assessment_id": exam.assessment_id,
            "title": exam.title,
            "date": exam.date,
            "time": exam.time,
            "duration": exam.duration,
            "created_date": exam.created_date.strftime("%d/%m/%Y %H:%M:%S"),
            "expiry": exam.expiry.strftime("%d/%m/%Y %H:%M:%S") if exam.expiry else "N/A",
            "file_status": exam.file_status,
            "status": exam.exam_status
        })
    return jsonify({"status": "success", "assessments": exams_data})

@app.route("/cancel_assessment/<assessment_id>", methods=["POST"])
def cancel_assessment(assessment_id):
    user_email = session.get("user_email")  # Get logged-in user's email
    if not user_email:
        return jsonify({"status": "error", "message": "User not logged in"}), 401


    assessment_id = request.form.get("assessment_id")

    # Fetch the assessment from the database
    exam = Exam.query.filter_by(assessment_id=assessment_id, created_by=user_email).first()
    
    if not exam:
        return jsonify({"status": "error", "message": "Assessment not found"}), 404

    # Check if the exam is already expired
    exam_datetime = datetime.strptime(exam.date + " " + exam.time, "%Y-%m-%d %H:%M")
    expiry_time = exam_datetime + timedelta(minutes=int(exam.duration))

    if datetime.now() > expiry_time:
        return jsonify({"status": "error", "message": "Cannot cancel an expired assessment"}), 400

    # Update status to "Cancelled"
    exam.exam_status = "Cancelled"
    db.session.commit()

    return jsonify({"status": "success", "message": "Assessment cancelled successfully"})

@app.route("/upload_attendee_images", methods=["POST"])
def upload_attendee_images():
    assessment_id = request.form.get("assessment_id")
    attendee_ids = request.form.getlist("attendee_ids[]")
    attendee_names = request.form.getlist("attendee_names[]")  # Get list of names
    files = request.files.getlist("face_images[]")

    if not assessment_id or not attendee_ids or not attendee_names or not files:
        return jsonify({"success": False, "message": "All fields are required!"})

    if len(attendee_ids) != len(attendee_names) or len(attendee_names) != len(files):
        return jsonify({"success": False, "message": "Mismatch in input lengths!"})

    uploaded_count = 0

    for i in range(len(files)):
        face_image = files[i].read()

        # Convert image to OpenCV format
        np_image = np.frombuffer(face_image, dtype=np.uint8)
        img_cv2 = cv2.imdecode(np_image, cv2.IMREAD_COLOR)

        # Extract face embedding using InsightFace
        faces = face_app.get(img_cv2)

        if not faces:
            return jsonify({"success": False, "message": f"No face detected in image {attendee_names[i]}!"})
        
        face_embedding = faces[0].normed_embedding.tolist()  # Convert to list for storage

        new_attendee = ExamAttendees(
            assessment_id=assessment_id,
            attendee_id=attendee_ids[i],
            attendee_name=attendee_names[i],  #Store different names
            face_image=face_image,
        )
        new_attendee.set_embedding(face_embedding)
        db.session.add(new_attendee)
        uploaded_count += 1

    db.session.commit()

    return jsonify({"success": True, "message": f"{uploaded_count} attendees added successfully!"})

@app.route("/logout")
def logout():
    session.pop("user_id", None)  # Remove user from session
    return redirect(url_for("index"))

@app.route("/assessment_details")
def assessment_details():
    return render_template("assessment_details.html")

@app.route('/verify_assessment', methods=["POST"])
def verify_assessment():
    assessmentId = request.form.get("assessmentId")

    # Query the database to check if assessment_id exists
    exam = Exam.query.filter_by(assessment_id=assessmentId).first()

    if not exam:
        return jsonify({"status": "error", "message": "Invalid Assessment ID"})
    
    current_time = datetime.now()
    exam_start_time = datetime.strptime(f"{exam.date} {exam.time}", "%Y-%m-%d %H:%M")

    # Convert stored expiry time (string) to datetime object
    if isinstance(exam.expiry, str):  # Convert only if it's a string
        expiry_time = datetime.strptime(exam.expiry, "%d/%m/%Y %H:%M:%S")
    else:
        expiry_time = exam.expiry  # It's already a datetime object

    # Check the exam status
    if exam.exam_status == "Cancelled":
        return jsonify({"status": "cancelled", "message": "Assessment has been cancelled"})
    elif exam.exam_status == "Expired" or current_time > expiry_time:
        exam.exam_status = "Expired"
        db.session.commit()  # Update the status in the database
        return jsonify({"status": "expired", "message": "Assessment has expired"})
    elif exam.exam_status == "In Progress" or exam_start_time <= current_time <= expiry_time:
        exam.exam_status = "In Progress"
        db.session.commit()
        return jsonify({"status": "in_progress", "message": "Assessment is currently in progress.You can take the test."})
    elif exam.exam_status == "Active":
        return jsonify({"status": "valid", "message": "Valid Assessment ID. Test not yet started."})

    return jsonify({"status": "error", "message": "Unknown assessment status"})

@app.route("/face_verification")
def face_verification():
    return render_template("face_verification.html")

def start_camera():
    camera = cv2.VideoCapture(0)
    return camera

def cosine_similarity(embedding1, embedding2):
    """Compute cosine similarity between two 2D embeddings of shape (1, 512)."""
    
    # Convert to NumPy array if not already
    embedding1 = np.array(embedding1)  
    embedding2 = np.array(embedding2)  
    
    # Ensure the shapes are (1, 512)
    if embedding1.shape != (1, 512) or embedding2.shape != (1, 512):
        raise ValueError(f"Shape mismatch: embedding1 {embedding1.shape}, embedding2 {embedding2.shape}")

    # Compute cosine similarity
    dot_product = np.dot(embedding1, embedding2.T)  # Transpose second embedding
    norm_product = np.linalg.norm(embedding1) * np.linalg.norm(embedding2)

    return (dot_product / norm_product) if norm_product != 0 else 0

@app.route('/verify_face', methods = ['POST'])
def verify_face():
    assessment_id = request.form.get('assessment_id')

    if not assessment_id:
        return jsonify({'error': 'Assessment ID is required!'})

    exam = Exam.query.filter_by(assessment_id=assessment_id).first()
    if not exam or exam.exam_status != "In Progress":
        return jsonify({'error': 'Invalid or inactive assessment!'})

    with app.app_context():
        attendees = ExamAttendees.query.filter_by(assessment_id=assessment_id).all()

    if not attendees:
        return jsonify({'error': 'No attendees found for this assessment!'})
    
    for attendee in attendees:
        completed_exam = Performance.query.filter_by(attendee_id=attendee.attendee_id, assessment_id=assessment_id).first()
        if completed_exam:
            return jsonify({
                'error': 'You have already completed this exam.',
                'attendee_id': attendee.attendee_id
            })

    # Start camera and capture an image
    camera = start_camera()
    success, frame = camera.read()
    camera.release()

    if not success:
        return jsonify({'error': 'Could not capture image!'})

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    faces = face_app.get(frame_rgb)

    if not faces:
        return jsonify({'error': 'No face detected!'})

    # Convert detected face embedding to NumPy array
    live_face_embedding = np.array(faces[0].normed_embedding).reshape(1, -1)    # Convert to 2D array for cosine similarity

    # Compare with stored embeddings
    for attendee in attendees:
        stored_embedding = attendee.get_embedding()  # Retrieve from database
        if stored_embedding is not None:
            stored_embedding = np.array(stored_embedding)  # Convert to 2D array

            # Ensure stored embedding is in (1, 512) shape
            if stored_embedding.shape[0] == 512:  
                stored_embedding = stored_embedding.reshape(1, -1)  # Reshape only if needed

            similarity_score = cosine_similarity(stored_embedding, live_face_embedding)[0][0]  # Compute similarity

            print(f"Similarity Score: {similarity_score}") 

            if similarity_score > 0.6:  # Threshold for face match
                session['assessment_id'] = assessment_id
                return jsonify({'success': True, 'message': 'Face verified!','attendee_id':attendee.attendee_id, 'redirect_url': url_for('instructions')})

    return jsonify({'error': 'Face verification failed due to mismatch! Please try again..'})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    camera = start_camera()
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    camera.release()

@app.route("/instructions")
def instructions():
    # Ensure only verified users can access instructions
    if "assessment_id" not in session:
        return redirect(url_for("index"))  # Redirect if no verification

    return render_template("instructions.html") 

@app.route('/log_violation', methods=['POST'])
def log_violation():
    violation_type = request.form.get('type')
    timestamp = request.form.get('timestamp')
    print(f"Violation Detected: {violation_type} at {timestamp}")
    return '', 204

@app.route("/exam")
def exam_page():
    return render_template("exam.html")

@app.route("/get_exam_details")
def get_exam_details():
    assessment_id = request.args.get("assessment_id")
    attendee_id = request.args.get("attendee_id")

    if not assessment_id:
        return jsonify({"error": "Missing assessment_id or attendee id"}), 400

    # Query using SQLAlchemy
    exam = Exam.query.filter_by(assessment_id=assessment_id).first()

    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    duration_minutes = exam.duration
    total_seconds = duration_minutes * 60 

    # Generate a unique session key for this exam + user
    session_key = f"exam_start_{assessment_id}_{attendee_id}"

    # Check if start time is already stored in session
    if session_key not in session:
        session[session_key] = datetime.now().isoformat()  # Store ISO format timestamp

    # Calculate time left
    start_time = datetime.fromisoformat(session[session_key])
    elapsed = (datetime.now() - start_time).total_seconds()
    remaining_seconds = max(0, int(total_seconds - elapsed))

    return jsonify({
        "exam_name": exam.title,
        "duration_minutes": duration_minutes,
        "remaining_seconds": remaining_seconds
    })

@app.route('/get_questions')
def get_questions():
    assessment_id = request.args.get('assessment_id')
    questions = Question.query.filter_by(assessment_id=assessment_id).all()
    
    question_list = []
    for q in questions:
        question_list.append({
            'id': q.id,
            'question_text': q.question_text,
            'question_type': q.question_type,
            'options': q.options,
        })

    return jsonify({'questions': question_list})

@app.route('/submit_answers', methods = ["POST"])
def submit_answers():
    data = request.json
    assessment_id = data.get('assessmentId')
    attendee_id = data.get('attendeeId')
    answers = data.get('answers')

    if not answers or not assessment_id or not attendee_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400
    
    try:
        answers_json = answers
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid question ID format"}), 400

    try:
        new_answer = AttendeeAnswer(
            assessment_id= assessment_id,
            attendee_id= attendee_id,
            answers_json= answers_json
        )
        db.session.add(new_answer)
        db.session.commit()

        #Performance calculation and storage
        questions = Question.query.filter_by(assessment_id = assessment_id).all()

        correct = 0
        incorrect = 0
        unanswered = 0

        for question in questions:
            submitted_answer = answers.get(str(question.id))

            if submitted_answer is None or submitted_answer.strip() == "":
                unanswered += 1
            else:
                # Extract correct value (e.g., "(B) Equator" => "Equator")
                correct_value = question.correct_answer.split(')', 1)[-1].strip()
                if submitted_answer.strip().lower() == correct_value.lower():
                    correct += 1
                else:
                    incorrect += 1

        total_marks = correct

        # Create or update performance
        performance = Performance.query.filter_by(
            assessment_id=assessment_id,
            attendee_id=attendee_id
        ).first()

        if performance:
            performance.correct_answers = correct
            performance.incorrect_answers = incorrect
            performance.unanswered = unanswered
            performance.total_marks = total_marks
        else:
            performance = Performance(
                assessment_id=assessment_id,
                attendee_id=attendee_id,
                correct_answers=correct,
                incorrect_answers=incorrect,
                unanswered=unanswered,
                total_marks=total_marks
            )
            db.session.add(performance)

        db.session.commit()
        return jsonify({"status": "success", "message": "Answers and performance stored successfully"})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/get_student_performance', methods = ["GET"])
def get_students_performance():
    assessment_id = request.args.get("assessment_id")

    if not assessment_id:
        return jsonify({"status": "error", "message": "Assessment ID is required."}), 400
    
    # Get exam metadata
    exam = Exam.query.filter_by(assessment_id=assessment_id).first()
    if not exam:
        return jsonify({"status": "error", "message": "Assessment not found"}), 404

    # Get performance data
    performances = Performance.query.filter_by(assessment_id=assessment_id).all()
    performance_data = []
    for perf in performances:
        performance_data.append({
            "attendee_id": perf.attendee_id,
            "correct_answers": perf.correct_answers,
            "incorrect_answers": perf.incorrect_answers,
            "unanswered": perf.unanswered,
            "total_marks": perf.total_marks
        })

    return jsonify({
        "status": "success",
        "exam": {
            "title": exam.title,
            "assessment_id": exam.assessment_id,
            "datetime": f"{exam.date} {exam.time}"
        },
        "performances": performance_data
    })

if __name__ == "__main__":
    app.run(debug=True)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
