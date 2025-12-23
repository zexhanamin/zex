from cryptography.fernet import Fernet, InvalidToken
from colorama import Fore, Style, init
import os
import time

init(autoreset=True)

CUSTOM_EXT = ".zex"

def banner():
    print(Fore.CYAN + Style.BRIGHT + """
 ███████╗███████╗██╗  ██╗
 ╚══███╔╝██╔════╝╚██╗██╔╝
   ███╔╝ █████╗   ╚███╔╝ 
  ███╔╝  ██╔══╝   ██╔██╗ 
 ███████╗███████╗██╔╝ ██╗
 ╚══════╝╚══════╝╚═╝  ╚═╝
    Secure File Crypto Tool
    """)

def loading(msg):
    print(Fore.YELLOW + msg, end="")
    for _ in range(3):
        time.sleep(0.4)
        print(".", end="")
    print()

def get_choice():
    while True:
        print(Fore.GREEN + "[1] Encrypt File")
        print(Fore.GREEN + "[2] Decrypt File\n")
        choice = input(Fore.WHITE + "Select option (1/2): ").strip()
        if choice in ["1", "2"]:
            return choice
        print(Fore.RED + "[-] Invalid option. Try again.\n")

def get_file():
    while True:
        filename = input(Fore.WHITE + "Enter file name: ").strip()
        if os.path.exists(filename):
            return filename
        print(Fore.RED + "[-] File not found. Enter correct file.\n")

def ask_delete():
    while True:
        ans = input(
            Fore.YELLOW + "Delete original file after encryption? (y/n): "
        ).strip().lower()
        if ans in ["y", "n"]:
            return ans == "y"
        print(Fore.RED + "[-] Please enter y or n.\n")

def main():
    banner()

    choice = get_choice()
    filename = get_file()

    try:
        # ---------------- ENCRYPT ----------------
        if choice == "1":
            loading("Encrypting")

            key = Fernet.generate_key()
            cipher = Fernet(key)

            with open(filename, "rb") as f:
                data = f.read()

            encrypted = cipher.encrypt(data)
            new_file = filename + CUSTOM_EXT

            with open(new_file, "wb") as f:
                f.write(encrypted)

            print(Fore.GREEN + "[+] Encryption successful")
            print(Fore.CYAN + f"[+] Encrypted file: {new_file}")
            print(Fore.YELLOW + Style.BRIGHT + "\n[!] SAVE THIS KEY SAFELY:")
            print(Fore.WHITE + key.decode())

            # ---- DELETE ORIGINAL FILE (OPTIONAL) ----
            if ask_delete():
                os.remove(filename)
                print(Fore.RED + "[!] Original file deleted securely")

        # ---------------- DECRYPT ----------------
        else:
            while True:
                key = input(Fore.WHITE + "Enter decryption key: ").encode()
                try:
                    cipher = Fernet(key)
                    break
                except Exception:
                    print(Fore.RED + "[-] Invalid key format. Try again.\n")

            loading("Decrypting")

            with open(filename, "rb") as f:
                encrypted_data = f.read()

            decrypted = cipher.decrypt(encrypted_data)

            if filename.endswith(CUSTOM_EXT):
                new_file = filename.replace(CUSTOM_EXT, "")
            else:
                new_file = "decrypted_" + filename

            with open(new_file, "wb") as f:
                f.write(decrypted)

            print(Fore.GREEN + "[+] Decryption successful")
            print(Fore.CYAN + f"[+] Output file: {new_file}")

    except InvalidToken:
        print(Fore.RED + "[-] Wrong key! Decryption failed")
    except Exception as e:
        print(Fore.RED + f"[-] Error: {e}")

if __name__ == "__main__":
    main()
