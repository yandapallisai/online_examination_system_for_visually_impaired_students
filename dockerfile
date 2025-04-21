# Use an official Python base image
FROM python:3.11

# Install system dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    build-essential \
    libgtk-3-dev \
    libboost-all-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the project files
COPY . .

# Install Python dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Run your app (change this to the actual entry point)
CMD ["python", "main.py"]
