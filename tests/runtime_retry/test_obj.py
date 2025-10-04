from lambdai import AI
import unittest
import os

class Person:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age


class TestObj(unittest.TestCase):
    def test_obj(self):
        with AI:
            table: list[list[str]] = AI.execute(
                "从csv文件{file}中读取数据并处理,"
                "保留表头'姓名'和'年龄',以及对应列的数据,"
                "返回list[list[str]]作为表格",

                "1.csv"
            )
            print(table)
            self.assertEqual(table[0], ["姓名", "年龄"])

            data: list[Person] = AI.execute(
                "将表格'姓名'和'年龄'的数据 {table} 转换为Person对象,"
                "表格第一行是表头，之后每一行是对应表头的数据,"
                "返回Person对象的列表",

                table
            )

            for person in data:
                self.assertIsInstance(person, Person)
        

if __name__ == "__main__":
    unittest.main()