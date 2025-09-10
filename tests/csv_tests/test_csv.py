import unittest
from lambdai import AI
from pathlib import Path


def parse_csv(fname):
    with AI:
        header, rows = AI.execute(
            "parse csv file {fname}, "
            "return header, rows. "
            "Header is a list",
            fname
        )
        # print(header, rows)
    return header, rows

def current_dir():
    return Path(__file__).resolve().parent

class TestCSVParsing(unittest.TestCase):
    def test_parse_csv(self):

        h1, r1 = parse_csv(current_dir() / "1.csv")
        h2, r2 = parse_csv(current_dir() / "2.csv")
        with AI:
            rows = AI.execute(
                "将表格{r1} {r2}(表头分别为{h1}, {h2})合并："
                "- 表头取两个表格表头的并集，保留表头"
                "- 根据key '身份证号'合并。"
                "- 生成rows：list[list[str]]",
                r1, r2, h1, h2
            )
            header = rows[0]
            print(rows)
            self.assertTrue(
                "身份证号" in header
                and "姓名" in header
                and "年龄" in header
                and "专业" in header,
                "header must contain '身份证号', '姓名', '年龄', '专业'"
            )
            rows = rows[1:]
            self.assertEqual(len(header), 4, "header must contain 4 columns")

if __name__ == "__main__":
    unittest.main()
