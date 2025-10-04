from lambdai import AI
import unittest


class Student:
    def __init__(self, name: str, age: int, student_id: str, major: str, gpa: float):
        self.name = name
        self.age = age
        self.student_id = student_id
        self.major = major
        self.gpa = gpa
        self._enrolled = True
        
    @property
    def is_enrolled(self) -> bool:
        return self._enrolled
        
    def update_gpa(self, new_gpa: float) -> None:
        if not 0.0 <= new_gpa <= 4.0:
            raise ValueError("GPA must be between 0.0 and 4.0")
        self.gpa = new_gpa
        
    def change_major(self, new_major: str) -> None:
        self.major = new_major
        
    def withdraw(self) -> None:
        self._enrolled = False


students_data = [
    ["张三", 18, "2023001", "计算机科学", 3.8],
    ["李四", 19, "2023002", "数学", 3.5], 
    ["王五", 20, "2023003", "物理", 3.9],
    ["赵六", 18, "2023004", "化学", 3.6],
    ["孙七", 19, "2023005", "生物", 3.7]
]


class TestStudent(unittest.TestCase):
    def test_student(self):
        with AI:
            students: list[Student] = AI.execute(
                "将姓名、年龄、学号、专业和GPA的数据 {data} 转换为Student对象,"
                "返回Student对象的列表",
                students_data
            )

            for student in students:
                self.assertIsInstance(student, Student)
        
        with AI:
            # How to call function
            # in prompt or provided as tools
            left_students: list[Student] = AI.execute(
                "将GPA小于3.7的学生 {students} 退学"
                "返回退学后剩下的学生列表",
                students,
                tests=lambda fn: fn([Student("", "", "", "", 0.0)]) == []
            )

            for student in left_students:
                if student.gpa < 3.7:
                    self.assertFalse(student.is_enrolled)
                else:
                    self.assertTrue(student.is_enrolled)


if __name__ == "__main__":
    unittest.main()