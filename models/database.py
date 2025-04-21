from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import LargeBinary
import pickle
import pytz

ist = pytz.timezone("Asia/Kolkata")

db = SQLAlchemy()

# Define User Model
class User(db.Model):
    __bind_key__ = 'users'  # Bind this model to users.db
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)

class Exam(db.Model):
    __bind_key__ = 'exams'
    __tablename__ = 'exam'
    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.String(10), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    date = db.Column(db.String(20), nullable=False)
    time = db.Column(db.String(20), nullable=False)
    duration = db.Column(db.Integer, nullable=False)
    expiry = db.Column(db.DateTime, nullable=False)  # Expiry timestamp
    created_date = db.Column(db.DateTime, default=datetime.now(ist))
    created_by = db.Column(db.String(100), nullable=False)
    file_status = db.Column(db.String(255), nullable=False)
    exam_status = db.Column(db.String(50), nullable=False)

class ExamFiles(db.Model):
    __bind_key__ = 'exams'
    __tablename__ = 'exam_files' 
    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.String(10), db.ForeignKey('exam.assessment_id'), nullable=False)
    question_paper = db.Column(LargeBinary, nullable=False)  # Store file as binary data
    filename = db.Column(db.String(255), nullable=False)

class ExamAttendees(db.Model):
    __bind_key__ = 'exams'
    __tablename__ = 'exam_attendees'
    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.String(10), db.ForeignKey('exam.assessment_id'), nullable=False)
    attendee_id = db.Column(db.String(10), nullable=False)
    attendee_name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=False)
    face_image = db.Column(db.LargeBinary, nullable=False)  # Store original image
    # Store face embeddings using PickleType
    face_embedding = db.Column(db.PickleType, nullable=True)

    def set_embedding(self, embedding):
        """Store NumPy array as a serialized object."""
        self.face_embedding = pickle.dumps(embedding)

    def get_embedding(self):
        """Retrieve NumPy array from a serialized object."""
        return pickle.loads(self.face_embedding) if self.face_embedding else None

class Question(db.Model):
    __bind_key__ = 'examination'  #Ensures this model uses PostgreSQL
    __tablename__ = 'questions'

    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.String(20), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(20), nullable=False)  # 'mcq', 'text', 'fill_blank'
    options = db.Column(db.JSON)  # Stores MCQ options in JSON format
    correct_answer = db.Column(db.Text, nullable=True)

    def __init__(self, assessment_id, question_text, question_type, options=None, correct_answer=None):
        self.assessment_id = assessment_id
        self.question_text = question_text
        self.question_type = question_type
        self.options = options
        self.correct_answer = correct_answer

class AttendeeAnswer(db.Model):
    __bind_key__ = 'examination'
    __tablename__ = 'answers'

    id = db.Column(db.Integer, primary_key = True)
    assessment_id = db.Column(db.String(20), nullable = False)
    attendee_id = db.Column(db.String(20), nullable = False)
    answers_json = db.Column(db.JSON, nullable = False)
    submitted_at = db.Column(db.DateTime, default=lambda: datetime.now(ist))

    def __init__(self, assessment_id, attendee_id, answers_json):
        self.assessment_id = assessment_id
        self.attendee_id = attendee_id
        self.answers_json = answers_json

class Performance(db.Model):
    __bind_key__ = 'examination'
    __tablename__ = 'performance'

    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.String(20), nullable=False)
    attendee_id = db.Column(db.String(20), nullable=False)
    correct_answers = db.Column(db.Integer, default=0)
    incorrect_answers = db.Column(db.Integer, default=0)
    unanswered = db.Column(db.Integer, default=0)
    total_marks = db.Column(db.Float, default=0.0)

    def __init__(self, assessment_id, attendee_id, correct_answers, incorrect_answers, unanswered, total_marks):
        self.assessment_id = assessment_id
        self.attendee_id = attendee_id
        self.correct_answers = correct_answers
        self.incorrect_answers = incorrect_answers
        self.unanswered = unanswered
        self.total_marks = total_marks
