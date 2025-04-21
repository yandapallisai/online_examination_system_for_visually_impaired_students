FROM python:3.11-slim

# Install build tools and dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    libboost-all-dev \
    git \
    wget \
    curl \
    && apt-get clean

# Optional: use precompiled dlib (faster)
RUN pip install dlib==19.24.2

# Install remaining Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy your app code
COPY . /app
WORKDIR /app

# Command to run your app
CMD ["python", "main.py"]
