def expel_students_lambdai(students: list) -> list:
    """
    将GPA小于3.7的学生 {students} 退学返回退学后剩下的学生列表
    """
    remaining_students = []
    for student in students:
        if student.gpa >= 3.7:
            remaining_students.append(student)
    return remaining_students