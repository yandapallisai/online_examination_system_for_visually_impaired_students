FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgtk-3-dev \
    libboost-all-dev \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    ffmpeg \
    curl \
    git \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy wheel file directly into container (adjust the filename as needed)
COPY dlib-19.24.1-cp311-cp311-win_amd64.whl ./dlib.whl

# Install prebuilt dlib first to avoid building it
RUN pip install --upgrade pip
RUN pip install ./dlib.whl

# Then install the rest of your requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose Flask port
EXPOSE 5000

# Start the app
CMD ["python", "app.py"]
