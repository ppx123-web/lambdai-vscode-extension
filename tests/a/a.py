from lambdai import AI

def main():

    with AI:
        a: int = AI.execute("1 + 1")
    print(a)

if __name__ == "__main__":
    main()