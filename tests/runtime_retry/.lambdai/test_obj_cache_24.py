def convert_table_to_persons_lambdai(table: list) -> list:
    """
    将表格'姓名'和'年龄'的数据 {table} 转换为Person对象,表格第一行是表头，之后每一行是对应表头的数据,返回Person对象的列表
    """
    import test_obj
    
    if not table or len(table) <= 1:
        return []
    
    # 获取表头
    headers = table[0]
    
    # 查找姓名和年龄的列索引
    name_index = headers.index('姓名')
    age_index = headers.index('年龄')
    
    persons = []
    
    # 从第二行开始处理数据
    for row in table[1:]:
        if len(row) > max(name_index, age_index):
            name = row[name_index]
            age = int(row[age_index])
            persons.append(test_obj.Person(name, age))
    
    return persons