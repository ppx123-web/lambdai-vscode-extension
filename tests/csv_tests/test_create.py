import unittest
from lambdai import AI


def data_generate():
    with AI:
        data: list[list[str]] = AI.execute(
            "Generate random string."
            "Return as list[list[str]]."
            "length of outer list is 10."
            "length of inner list is 5."
        )
    return data

class TestCSVParsing(unittest.TestCase):
    
    def test_create(self):
        d1 = data_generate()
        print(d1)
        d2 = data_generate()
        with AI:
            d: list[str] = AI.execute(
                "Megre the data '{d1}', '{d2}'. "
                "and sort the data by each string"
                "Return as list[str]. ",
                d1, d2,
                tests=lambda fn: fn(
                    [["123"]], [["456"]]
                ) == ["123", "456"]
            )
            self.assertTrue(len(d) == 100)
            for index, s in enumerate(d):
                self.assertTrue(isinstance(s, str))
                if index < len(d) - 1:
                    self.assertTrue(d[index] <= d[index + 1])

            print(d)

if __name__ == "__main__":
    unittest.main()
