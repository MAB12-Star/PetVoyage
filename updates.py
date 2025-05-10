import json
from pymongo import MongoClient

# Connect to your MongoDB Atlas cluster
target_client = MongoClient("mongodb+srv://michaelaronblue:SimoBb4OVT0soBRy@cluster0.d0mdx.mongodb.net/")
target_db = target_client["test"]
target_collection = target_db["airlines"]

# Path to your JSON file
json_path = "all_17_airline_pet_data.json"  # Adjust path if needed

# Load the JSON data
with open(json_path, "r", encoding="utf-8") as file:
    data = json.load(file)

# Perform upsert (update or insert) for each document using _id
for doc in data:
    target_collection.update_one(
        {"_id": doc["_id"]},     # Match by _id
        {"$set": doc},           # Update the whole document
        upsert=True              # Insert if not found
    )

print("✅ All documents have been upserted into the 'airlines' collection.")
