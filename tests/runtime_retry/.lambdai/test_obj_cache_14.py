def read_csv_lambdai(file: str) -> list[list[str]]:
    """
    从csv文件{file}中读取数据并处理,保留表头'姓名'和'年龄',以及对应列的数据,返回list[list[str]]作为表格
    """
    import csv
    
    result = []
    with open(file, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        headers = next(reader)
        
        # 获取'姓名'和'年龄'列的索引
        name_index = headers.index('姓名')
        age_index = headers.index('年龄')
        
        # 添加表头
        result.append(['姓名', '年龄'])
        
        # 读取数据行，只保留姓名和年龄列
        for row in reader:
            if len(row) > max(name_index, age_index):
                result.append([row[name_index], row[age_index]])
    
    return result