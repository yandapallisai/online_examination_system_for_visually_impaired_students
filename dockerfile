# Python with build tools
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    cmake build-essential \
    libgtk-3-dev libboost-all-dev \
    libopenblas-dev liblapack-dev \
    ffmpeg libsm6 libxext6 curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dlib .whl FIRST so Docker can cache it
COPY dlib-19.24.1-cp311-cp311-manylinux_2_28_x86_64.whl .

RUN pip install --upgrade pip
RUN pip install ./dlib-19.24.1-cp311-cp311-manylinux_2_28_x86_64.whl

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
