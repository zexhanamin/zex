# Zex - Secure File Crypto Tool

A tool that uses cryptography to secure your files so strongly that no one can even think of decrypting them. You can use your own custom file extension for extra control.

## Features
- Encrypt and decrypt files using strong cryptography (Fernet symmetric encryption)
- Optionally delete original files after encryption
- Custom file extension support (default: `.zex`)
- Easy-to-use CLI interface with colorized output

## Installation
1. Clone the repository:
```
git clone https://github.com/username/zex.git
cd zex
Install dependencies:

pip install cryptography colorama
```
## Usage
Run the tool:
```
python crypto.py
Choose Encrypt or Decrypt

Provide file name
```
  Save your encryption key safely (required for decryption)

## Notes
Do NOT share your key publicly, otherwise your files can be decrypted by anyone who has it.

Original files can optionally be deleted after encryption.
