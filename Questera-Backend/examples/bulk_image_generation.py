#!/usr/bin/env python3
"""
Bulk Image Generation Script (Python)

This script demonstrates how to use the bulk image generation API
to create multiple variations of a person in different scenarios.

Usage:
    python bulk_image_generation.py --image path/to/image.jpg --prompts prompts.txt
"""

import requests
import base64
import json
import argparse
import time
from pathlib import Path

# Configuration
API_URL = "http://localhost:3000/api/image/bulk-generate"
USER_ID = "test-user-123"

def image_to_base64(image_path):
    """Convert image file to base64 string"""
    with open(image_path, 'rb') as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def get_mime_type(image_path):
    """Get MIME type from file extension"""
    extension = Path(image_path).suffix.lower()
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    }
    return mime_types.get(extension, 'image/jpeg')

def load_prompts(prompts_file):
    """Load prompts from a text file (one per line)"""
    with open(prompts_file, 'r', encoding='utf-8') as f:
        prompts = [line.strip() for line in f if line.strip()]
    return prompts

def bulk_generate_images(
    image_path,
    prompts,
    aspect_ratio='1:1',
    image_size='2K',
    style='photorealistic',
    batch_name=None,
    api_url=API_URL,
    user_id=USER_ID
):
    """
    Generate multiple images using one reference image and multiple prompts
    
    Args:
        image_path: Path to the reference image
        prompts: List of prompts or path to prompts file
        aspect_ratio: Image aspect ratio (default: '1:1')
        image_size: Image size '2K' or '4K' (default: '2K')
        style: Image style (default: 'photorealistic')
        batch_name: Optional name for this batch
        api_url: API endpoint URL
        user_id: User ID for tracking
    
    Returns:
        dict: API response with generated images
    """
    
    print("🚀 Starting bulk image generation...\n")
    
    # Load prompts from file if it's a path
    if isinstance(prompts, str) and Path(prompts).exists():
        prompts = load_prompts(prompts)
    
    # Convert image to base64
    print(f"📸 Loading reference image: {image_path}")
    image_base64 = image_to_base64(image_path)
    mime_type = get_mime_type(image_path)
    
    print(f"📋 Processing {len(prompts)} prompts")
    print(f"⚙️  Settings: {image_size}, {aspect_ratio}, {style}\n")
    
    # Prepare request payload
    payload = {
        "referenceImage": {
            "data": image_base64,
            "mimeType": mime_type
        },
        "prompts": prompts,
        "userId": user_id,
        "aspectRatio": aspect_ratio,
        "imageSize": image_size,
        "style": style
    }
    
    if batch_name:
        payload["batchName"] = batch_name
    
    # Make API request
    print("🌐 Sending request to API...")
    start_time = time.time()
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        result = response.json()
        
        elapsed_time = time.time() - start_time
        
        if result.get('success'):
            print(f"\n✅ Bulk generation completed in {elapsed_time:.1f} seconds!\n")
            print(f"📊 Results:")
            print(f"   Total prompts: {result['totalPrompts']}")
            print(f"   Successful: {result['successCount']}")
            print(f"   Failed: {result['failureCount']}")
            print(f"   Chat ID: {result['imageChatId']}\n")
            
            print("🖼️  Generated Images:")
            for i, item in enumerate(result['results'], 1):
                prompt_preview = item['prompt'][:60] + "..." if len(item['prompt']) > 60 else item['prompt']
                print(f"\n{i}. {prompt_preview}")
                print(f"   URL: {item['imageUrl']}")
            
            if result.get('errors'):
                print("\n❌ Errors:")
                for i, error in enumerate(result['errors'], 1):
                    prompt_preview = error['prompt'][:60] + "..." if len(error['prompt']) > 60 else error['prompt']
                    print(f"\n{i}. {prompt_preview}")
                    print(f"   Error: {error['error']}")
            
            # Save results to file
            output_file = f"bulk_generation_results_{int(time.time())}.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"\n💾 Results saved to: {output_file}")
            
            return result
        else:
            print(f"❌ Generation failed: {result.get('error', 'Unknown error')}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Bulk Image Generation')
    parser.add_argument('--image', required=True, help='Path to reference image')
    parser.add_argument('--prompts', required=True, help='Path to prompts file (one per line) or comma-separated prompts')
    parser.add_argument('--aspect-ratio', default='1:1', help='Aspect ratio (default: 1:1)')
    parser.add_argument('--size', default='2K', choices=['2K', '4K'], help='Image size (default: 2K)')
    parser.add_argument('--style', default='photorealistic', help='Image style (default: photorealistic)')
    parser.add_argument('--batch-name', help='Optional batch name')
    parser.add_argument('--api-url', default=API_URL, help=f'API URL (default: {API_URL})')
    parser.add_argument('--user-id', default=USER_ID, help=f'User ID (default: {USER_ID})')
    
    args = parser.parse_args()
    
    # Parse prompts
    if Path(args.prompts).exists():
        prompts = load_prompts(args.prompts)
    else:
        prompts = [p.strip() for p in args.prompts.split(',')]
    
    # Generate images
    bulk_generate_images(
        image_path=args.image,
        prompts=prompts,
        aspect_ratio=args.aspect_ratio,
        image_size=args.size,
        style=args.style,
        batch_name=args.batch_name,
        api_url=args.api_url,
        user_id=args.user_id
    )

if __name__ == '__main__':
    main()

