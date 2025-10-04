def convert_to_students_lambdai(data: list) -> list:
    """
    将姓名、年龄、学号、专业和GPA的数据 {data} 转换为Student对象,返回Student对象的列表
    """
    students = []
    for item in data:
        student = Student(
            name=item[0],
            age=item[1],
            student_id=item[2],
            major=item[3],
            gpa=item[4]
        )
        students.append(student)
    return students